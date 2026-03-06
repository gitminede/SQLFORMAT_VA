# SQL Formattáló (Python)

A projekt Python-alapú SQL formázó, webes felülettel.

## Lokális indítás

```bash
python3 app.py
```

Ezután nyisd meg: `http://127.0.0.1:8080`

## Letöltés a felületről

A **Letöltés artifactként** gomb `formatted.sql` fájlt tölt le.

## GitHub Actions build (belső build)

A `.github/workflows/build.yml` workflow kézzel indítható (`workflow_dispatch`) az Actions fülről.
A futás végeredménye letölthető artifact: **`sqlformat_va.exe`**.

## Lokális ellenőrzés

```bash
python3 -m py_compile app.py formatter.py
```
