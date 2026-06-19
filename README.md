# Feria de Ropa — Sistema de cobro

## Archivos

- `FeriaApp.jsx` — App principal (PWA, cobro, admin)
- `index.html` — Entrada de la PWA
- `manifest.json` — Configuración PWA (ícono, nombre)
- `etiquetas.html` — Generador de etiquetas imprimibles (standalone, sin servidor)

---

## Paso 1: Crear proyecto en Firebase

1. Ir a https://firebase.google.com → "Crear proyecto"
2. Nombre: `feria-ropa` → desactivar Analytics → Crear
3. En el menú izquierdo: **Firestore Database** → Crear base de datos → Modo de prueba
4. **Configuración del proyecto** (ícono ⚙️) → "Tus apps" → `</>` (Web)
5. Nombre de la app: `feria-web` → Registrar app
6. Copiar el objeto `firebaseConfig` que aparece

---

## Paso 2: Pegar el firebaseConfig

En `FeriaApp.jsx`, reemplazar el objeto `FIREBASE_CONFIG` al principio del archivo con los valores reales de Firebase.

---

## Paso 3: Deploy en Vercel (gratis, 2 minutos)

### Opción A: Desde GitHub (recomendado)
1. Subir los archivos a un repositorio en GitHub
2. Ir a https://vercel.com → New Project → importar el repo
3. Framework: **Vite**
4. Deploy

### Opción B: Sin GitHub, directo
1. Instalar Vercel CLI: `npm i -g vercel`
2. En la carpeta del proyecto: `vercel`
3. Seguir los pasos → te da una URL pública

---

## Paso 4: Instalar como app en el celular

### Android (Chrome)
1. Abrir la URL en Chrome
2. Menú (⋮) → "Agregar a pantalla de inicio"

### iPhone (Safari)
1. Abrir la URL en Safari
2. Botón compartir → "Agregar a pantalla de inicio"

---

## Generador de etiquetas

`etiquetas.html` funciona **sin servidor** — abrilo directamente en el navegador.

1. Elegir dueña (Vanessa / Mariana)
2. Elegir categoría
3. Ingresar cantidad de etiquetas y número inicial
4. "Generar hoja"
5. "Imprimir / PDF"

Cada hoja A4 tiene 21 etiquetas (3 columnas × 7 filas).
Las etiquetas de precio fijo muestran el precio impreso.
Las etiquetas "Especial" tienen espacio en blanco para escribir el precio a mano.

---

## Formato del QR

Cada QR codifica: `DUENA|categoriaId|precio`

Ejemplos:
- `Vanessa|jeans|20000`
- `Mariana|remera|8000`
- `Vanessa|especial|` ← precio libre (se ingresa manualmente en la app)

---

## Precios de prueba (para editar en el panel Admin)

| Categoría  | Precio |
|------------|--------|
| Jeans      | $20.000 |
| Pantalón   | $20.000 |
| Short      | $12.000 |
| Remera     | $8.000 |
| Top        | $8.000 |
| Sweater    | $15.000 |
| Buzo       | $15.000 |
| Bikini     | $12.000 |
| Abrigo     | $25.000 |
| Vestido    | $18.000 |
| Zapatilla  | $22.000 |
| Bota       | $25.000 |
| Especial   | libre  |

## Descuentos automáticos (para editar en el panel Admin)

| Prendas | Descuento |
|---------|-----------|
| 2       | 10%       |
| 3       | 15%       |
| 4       | 20%       |
| 5+      | 25%       |
