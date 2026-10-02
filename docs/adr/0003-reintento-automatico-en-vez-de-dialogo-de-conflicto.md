# Un conflicto se reintenta solo, no se pregunta

El sistema detecta conflictos por versión y abre un diálogo para que el usuario elija entre su
versión y la del servidor. Mientras ese diálogo está abierto, la cola entera deja de enviar.

Como todos los dispositivos en conflicto son del mismo usuario, la elección casi nunca aporta
información: pedirla es ceremonia, y bloquear la sincronización hasta que alguien la atienda
convierte un conflicto trivial en una parada total. Decidimos reintentar automáticamente sobre
la versión del servidor y avisar de forma discreta, en lugar de interrumpir.
