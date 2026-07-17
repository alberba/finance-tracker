#!/usr/bin/env python3
"""Extracts a seed dataset from the finance Excel workbook.

Usage:
  python3 scripts/extract_excel_seed.py \
      --input "/ruta/al/archivo.xlsx" \
      --output /tmp/finance-seed.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Tuple

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

MONTH_NAMES = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
]

COL_ROW_RE = re.compile(r"([A-Z]+)(\d+)")


def to_iso_date(serial_or_text: Optional[str], year_hint: int) -> Optional[str]:
    if serial_or_text in (None, ""):
        return None

    try:
        serial = float(serial_or_text)
        # Excel date serial origin (1900 system): 1899-12-30
        date_value = dt.datetime(1899, 12, 30) + dt.timedelta(days=serial)
        return date_value.date().isoformat()
    except ValueError:
        pass

    value = str(serial_or_text).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue

    # fallback: if only month/day-like not parseable, place it in hint year
    if re.fullmatch(r"\d{1,2}/\d{1,2}", value):
        day, month = map(int, value.split("/"))
        return dt.date(year_hint, month, day).isoformat()

    return None


def col_to_num(col: str) -> int:
    number = 0
    for ch in col:
        number = number * 26 + ord(ch) - 64
    return number


def read_shared_strings(zf: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    sst = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    items: List[str] = []
    for si in sst.findall("main:si", NS):
        texts = [t.text or "" for t in si.iter(f"{{{NS['main']}}}t")]
        items.append("".join(texts))
    return items


def read_sheet_targets(zf: zipfile.ZipFile) -> Dict[str, str]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels}
    mapping: Dict[str, str] = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        rid = sheet.attrib[f"{{{NS['rel']}}}id"]
        mapping[name] = rel_map[rid]
    return mapping


def read_cells(zf: zipfile.ZipFile, target: str, shared_strings: List[str]) -> Dict[str, str]:
    path = target if target.startswith("xl/") else f"xl/{target}"
    xml = ET.fromstring(zf.read(path))
    cells: Dict[str, str] = {}

    for cell in xml.findall(".//main:c", NS):
        ref = cell.attrib.get("r")
        if not ref:
            continue

        value = None
        cell_type = cell.attrib.get("t")
        f = cell.find("main:f", NS)
        v = cell.find("main:v", NS)
        inline = cell.find("main:is", NS)

        if cell_type == "s" and v is not None and v.text is not None:
            idx = int(v.text)
            value = shared_strings[idx] if 0 <= idx < len(shared_strings) else v.text
        elif cell_type == "inlineStr" and inline is not None:
            value = "".join([t.text or "" for t in inline.iter(f"{{{NS['main']}}}t")])
        elif v is not None:
            value = v.text

        if value is not None:
            cells[ref] = value
        elif f is not None:
            # preserve references that are formula-only to ease scans
            cells[ref] = ""

    return cells


def read_column(cells: Dict[str, str], col: str, start: int, end: int) -> List[str]:
    values: List[str] = []
    for row in range(start, end + 1):
        value = cells.get(f"{col}{row}", "").strip()
        if value:
            values.append(value)
    return values


def parse_list_with_amount(cells: Dict[str, str], label_col: str, amount_col: str, start: int, end: int) -> List[Dict[str, object]]:
    items: List[Dict[str, object]] = []
    for row in range(start, end + 1):
        name = cells.get(f"{label_col}{row}", "").strip()
        if not name:
            continue

        raw_amount = cells.get(f"{amount_col}{row}", "").strip()
        amount = 0.0
        if raw_amount and raw_amount not in ("-",):
            try:
                amount = float(raw_amount.replace(",", "."))
            except ValueError:
                amount = 0.0

        items.append(
            {
                "id": slug(name),
                "name": name,
                "openingBalance": round(amount, 2),
            }
        )
    return items


def slug(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return clean or "item"


def parse_transactions(
    month_name: str,
    month_index: int,
    cells: Dict[str, str],
    year_hint: int,
    income_set: set,
    expense_set: set,
    investment_set: set,
) -> List[Dict[str, object]]:
    items: List[Dict[str, object]] = []
    row = 10
    while row <= 220:
        date_raw = cells.get(f"C{row}", "").strip()
        category = cells.get(f"E{row}", "").strip()
        amount_raw = cells.get(f"H{row}", "").strip()

        if not date_raw and not category and not amount_raw:
            row += 1
            continue

        try:
            amount = float(amount_raw.replace(",", "."))
        except ValueError:
            row += 1
            continue

        account = cells.get(f"D{row}", "").strip()
        description = cells.get(f"F{row}", "").strip()

        if category in income_set:
            tx_type = "income"
        elif category in expense_set:
            tx_type = "expense"
        elif category in investment_set:
            tx_type = "investment"
        else:
            # fallback: unknown categories are expenses unless explicitly income-like
            tx_type = "expense"

        date_iso = to_iso_date(date_raw, year_hint)
        if not date_iso:
            date_iso = f"{year_hint}-{month_index + 1:02d}-01"

        items.append(
            {
                "id": f"{month_name.lower()}-{row}",
                "date": date_iso,
                "month": month_index,
                "type": tx_type,
                "accountId": slug(account) if account else "",
                "accountName": account,
                "category": category,
                "description": description,
                "amount": round(amount, 2),
            }
        )
        row += 1

    return items


def parse_snapshots(
    month_index: int,
    cells: Dict[str, str],
) -> Dict[str, object]:
    accounts: Dict[str, float] = {}
    investments: Dict[str, float] = {}

    # R:S liquidity current values
    for row in range(10, 90):
        name = cells.get(f"R{row}", "").strip()
        amount_raw = cells.get(f"S{row}", "").strip()
        if not name:
            continue
        try:
            amount = float(amount_raw.replace(",", "."))
        except ValueError:
            continue
        accounts[slug(name)] = round(amount, 2)

    # T:U investment current values
    for row in range(10, 90):
        name = cells.get(f"T{row}", "").strip()
        amount_raw = cells.get(f"U{row}", "").strip()
        if not name:
            continue
        try:
            amount = float(amount_raw.replace(",", "."))
        except ValueError:
            continue
        investments[slug(name)] = round(amount, 2)

    return {
        "month": month_index,
        "accounts": accounts,
        "investments": investments,
        "liabilities": {},
    }


def parse_budget(cells: Dict[str, str], income_categories: List[str], expense_categories: List[str], investment_categories: List[str]):
    month_plan_cols = ["D", "F", "H", "J", "L", "N", "P", "R", "T", "V", "X", "Z"]

    def empty_map(categories: List[str]) -> Dict[str, List[float]]:
        return {category: [0.0] * 12 for category in categories}

    budget = {
        "income": empty_map(income_categories),
        "expense": empty_map(expense_categories),
        "investment": empty_map(investment_categories),
    }

    # Scan all rows looking for category in column B and planned values in D,F,H...
    for row in range(10, 260):
        category = cells.get(f"B{row}", "").strip()
        if not category:
            continue

        bucket = None
        if category in budget["income"]:
            bucket = "income"
        elif category in budget["expense"]:
            bucket = "expense"
        elif category in budget["investment"]:
            bucket = "investment"

        if not bucket:
            continue

        for month_idx, col in enumerate(month_plan_cols):
            raw = cells.get(f"{col}{row}", "").strip()
            if raw in ("", "-"):
                value = 0.0
            else:
                try:
                    value = float(raw.replace(",", "."))
                except ValueError:
                    value = 0.0
            budget[bucket][category][month_idx] = round(value, 2)

    return budget


def parse_goals(cells: Dict[str, str]):
    def goal(prefix_row: int) -> Dict[str, object]:
        name = cells.get(f"B{prefix_row}", "").strip() or "Objetivo"
        year = int(float(cells.get(f"D{prefix_row}", "0") or 0)) if cells.get(f"D{prefix_row}") else 0
        amount_raw = cells.get(f"L{prefix_row}", "0")
        try:
            amount = float(amount_raw)
        except ValueError:
            amount = 0.0
        return {
            "name": name,
            "targetYear": year,
            "targetAmount": round(amount, 2),
        }

    return {
        "short": goal(6),
        "medium": goal(9),
        "long": goal(12),
        "investmentTotal": goal(47),
        "investmentFunds": goal(50),
        "investmentCrypto": goal(53),
    }


def parse_contributions(cells: Dict[str, str], year_hint: int):
    entries: List[Dict[str, object]] = []
    for row in range(4, 260):
        date_raw = cells.get(f"B{row}", "").strip()
        amount_raw = cells.get(f"C{row}", "").strip()
        portfolio_date_raw = cells.get(f"E{row}", "").strip()
        portfolio_value_raw = cells.get(f"F{row}", "").strip()
        flow_raw = cells.get(f"G{row}", "").strip()

        if not date_raw and not amount_raw and not portfolio_value_raw:
            continue

        amount = 0.0
        portfolio_value = None
        flow = None

        if amount_raw:
            try:
                amount = float(amount_raw.replace(",", "."))
            except ValueError:
                amount = 0.0

        if portfolio_value_raw:
            try:
                portfolio_value = float(portfolio_value_raw.replace(",", "."))
            except ValueError:
                portfolio_value = None

        if flow_raw:
            try:
                flow = float(flow_raw.replace(",", "."))
            except ValueError:
                flow = None

        entry_date = to_iso_date(date_raw, year_hint)
        portfolio_date = to_iso_date(portfolio_date_raw, year_hint)

        if not entry_date and not portfolio_date:
            continue

        entries.append(
            {
                "id": f"contrib-{row}",
                "date": entry_date or portfolio_date,
                "amount": round(amount, 2),
                "portfolioDate": portfolio_date or entry_date,
                "portfolioValue": round(portfolio_value, 2) if portfolio_value is not None else None,
                "flow": round(flow, 2) if flow is not None else None,
            }
        )

    return entries


def ensure_known_accounts(transactions: List[Dict[str, object]], accounts: List[Dict[str, object]]) -> List[Dict[str, object]]:
    known = {acc["id"] for acc in accounts}
    for tx in transactions:
        account_id = tx.get("accountId")
        account_name = tx.get("accountName")
        if account_id and account_id not in known:
            accounts.append(
                {
                    "id": account_id,
                    "name": account_name or account_id,
                    "openingBalance": 0.0,
                }
            )
            known.add(account_id)
    return accounts


def build_seed(input_path: Path) -> Dict[str, object]:
    with zipfile.ZipFile(input_path) as zf:
        shared_strings = read_shared_strings(zf)
        sheet_targets = read_sheet_targets(zf)

        cfg_cells = read_cells(zf, sheet_targets["CONFIGURACIÓN"], shared_strings)
        year = int(float(cfg_cells.get("Q2", "2026")))

        accounts = parse_list_with_amount(cfg_cells, "C", "D", 7, 120)
        investment_assets = parse_list_with_amount(cfg_cells, "F", "G", 7, 120)
        liabilities = parse_list_with_amount(cfg_cells, "I", "J", 7, 120)

        income_categories = read_column(cfg_cells, "O", 7, 160)
        expense_categories = read_column(cfg_cells, "Q", 7, 160)
        investment_categories = [item["name"] for item in investment_assets]

        income_set = set(income_categories)
        expense_set = set(expense_categories)
        investment_set = set(investment_categories)

        transactions: List[Dict[str, object]] = []
        snapshots_by_month: Dict[str, Dict[str, object]] = {}

        for month_index, month_name in enumerate(MONTH_NAMES):
            if month_name not in sheet_targets:
                continue
            month_cells = read_cells(zf, sheet_targets[month_name], shared_strings)
            transactions.extend(
                parse_transactions(
                    month_name,
                    month_index,
                    month_cells,
                    year,
                    income_set,
                    expense_set,
                    investment_set,
                )
            )

            snapshot = parse_snapshots(month_index, month_cells)
            if snapshot["accounts"] or snapshot["investments"] or snapshot["liabilities"]:
                snapshots_by_month[str(month_index)] = snapshot

        accounts = ensure_known_accounts(transactions, accounts)

        budget_cells = read_cells(zf, sheet_targets.get("PRESUPUESTO", "worksheets/sheet6.xml"), shared_strings)
        budget = parse_budget(
            budget_cells,
            income_categories,
            expense_categories,
            investment_categories,
        )

        goals_cells = read_cells(zf, sheet_targets.get("OBJETIVOS", "worksheets/sheet5.xml"), shared_strings)
        goals = parse_goals(goals_cells)

        contributions_cells = read_cells(zf, sheet_targets.get("APORTES INVERSION", "worksheets/sheet4.xml"), shared_strings)
        contributions = parse_contributions(contributions_cells, year)

        return {
            "meta": {
                "source": str(input_path),
                "generatedAt": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z"),
                "version": 1,
            },
            "year": year,
            "currency": "EUR",
            "accounts": accounts,
            "investmentAssets": investment_assets,
            "liabilities": liabilities,
            "incomeCategories": income_categories,
            "expenseCategories": expense_categories,
            "investmentCategories": investment_categories,
            "transactions": transactions,
            "snapshots": snapshots_by_month,
            "budget": budget,
            "goals": goals,
            "contributions": contributions,
        }


def write_output(seed: Dict[str, object], output_path: Path) -> None:
    payload = json.dumps(seed, ensure_ascii=False, indent=2)
    if output_path.suffix == ".json":
        output_path.write_text(f"{payload}\n", encoding="utf-8")
        return

    text = f"export const FINANCE_TRACKER_SEED = {payload} as const;\n\nexport default FINANCE_TRACKER_SEED;\n"
    output_path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract finance tracker seed data from an XLSX workbook")
    parser.add_argument("--input", required=True, help="Path to XLSX file")
    parser.add_argument("--output", required=True, help="Output TypeScript file path")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    seed = build_seed(input_path)
    write_output(seed, output_path)


if __name__ == "__main__":
    main()
