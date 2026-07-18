import type { Entity } from '../../scripts/types'

export interface InvestmentBuckets {
  fundsValue: number
  cryptoValue: number
}

type InvestmentAsset = Pick<Entity, 'id' | 'name'>

export function getInvestmentBuckets(
  assets: readonly InvestmentAsset[],
  month: number,
  getInvestmentValue: (assetId: string, month: number) => number,
): InvestmentBuckets {
  return {
    fundsValue: sumMatchingAssets(assets, /fond|index/i, month, getInvestmentValue),
    cryptoValue: sumMatchingAssets(assets, /crypto|btc|eth/i, month, getInvestmentValue),
  }
}

function sumMatchingAssets(
  assets: readonly InvestmentAsset[],
  namePattern: RegExp,
  month: number,
  getInvestmentValue: (assetId: string, month: number) => number,
): number {
  return assets
    .filter((asset) => namePattern.test(asset.name))
    .reduce((sum, asset) => sum + getInvestmentValue(asset.id, month), 0)
}
