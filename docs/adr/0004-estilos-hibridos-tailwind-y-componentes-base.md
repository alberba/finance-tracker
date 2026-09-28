# Estilos: Tailwind en la plantilla, componentes base y scoped solo estructural

Casi todo el estilo vivía en una hoja global de ~4.300 líneas, cargada fuera de cualquier capa
de cascada. Ganaba a las utilidades de Tailwind, una regla podía romper otra pantalla, el código
muerto se acumulaba y localizar el estilo de un elemento costaba a un agente unas 3,5 veces más
tokens y búsquedas que tenerlo junto al componente.

Decidimos un híbrido. Las utilidades de Tailwind en la plantilla, solo con tokens de `@theme`,
son lo predeterminado. Lo que se repite entre ficheros se convierte en un componente base, no en
una clase global ni en `@apply`. `<style scoped>` queda para lo que las utilidades no expresan
bien: animaciones, selectores estructurales y pseudo-elementos, `::backdrop`, internos de
librerías y `v-bind()`. El CSS global se
limita a tokens, reset, tipografía base y shell. La hoja heredada se congela en una capa por
debajo de Tailwind y se vacía por zonas hasta desaparecer.

Descartamos CSS global con capas, porque conserva el radio de impacto y el coste de búsqueda.
Descartamos también `<style scoped>` o CSS modules como norma general, porque dispersan los
tokens y duplican lo que Tailwind ya resuelve. La medición y las fuentes están en
`docs/architecture/estilos-tailwind-vs-css.md`.
