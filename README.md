# SQL Formattáló (EXE)

Ez a projekt Python nélkül fut, és egyetlen futtatható fájlba (`.exe`) fordítható.

## Fejlesztői futtatás

```bash
go run .
```

Indítás után a program egy lokális webszervert nyit, majd automatikusan megnyitja a felületet a böngészőben.

## Windows EXE build

```bash
GOOS=windows GOARCH=amd64 go build -o dist/sqlformatter.exe .
```

Az elkészült `dist/sqlformatter.exe` tartalmazza a teljes UI-t (`index.html`, `style.css`, `app.js`) beágyazva, külső Python / webszerver nélkül.
