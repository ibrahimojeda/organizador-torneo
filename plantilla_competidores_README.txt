PLANTILLA CSV — IMPORTACIÓN DE COMPETIDORES
============================================
La primera fila DEBE ser el encabezado (exactamente así):

  nombre,documento,genero,fecha_nacimiento,peso,cinturon,club,pais,modalidad

Cada fila siguiente es un competidor.

ENCABEZADOS QUE EL SISTEMA LEE (canónicos)
------------------------------------------
  nombre              -> Nombre completo            (obligatorio)
  documento           -> DNI / pasaporte            (opcional)
  genero              -> M o F                      (obligatorio)
  fecha_nacimiento    -> AAAA-MM-DD                 (obligatorio)
  peso                -> kg, decimal con punto      (obligatorio)
  cinturon            -> blanco/amarillo/naranja/verde/azul/marron/negro
  club                -> Dojo / Club                (opcional)
  pais                -> Nombre del país            (opcional; si falta usa Argentina)
  modalidad           -> kumite / kata / ambos      (opcional; si falta usa kumite)

ALIAS DE ENCABEZADO ACEPTADOS (también los lee)
-----------------------------------------------
  genero             -> también acepta: género
  cinturon           -> también acepta: cinturón
  fecha_nacimiento   -> también acepta: fecha
  pais               -> también acepta: país
  modalidad          -> también acepta: discipline

VALORES ACEPTADOS
-----------------
  genero:  M  o  F        (texto que empiece con M o F)
  cinturon: blanco, amarillo, naranja, verde, azul, marron, negro
            (alias en inglés: white, yellow, orange, green, blue, brown, black)
  modalidad: kumite, kata, ambos
             (alias: both, ambas)
  fecha:  formato YYYY-MM-DD   ej: 2005-03-15
  peso:   número decimal usando punto   ej: 67.5

REGLAS IMPORTANTES
------------------
1. No uses comas dentro de ningún campo (la app separa por coma simple).
   Evita clubes como: Dojo Silva, C.A.
2. Puedes dejar columnas opcionales vacías (quedan dos comas juntas),
   pero NO borres columnas de la fila de encabezado.
3. Guarda el archivo en UTF-8 (recomendado, compatible Excel).
4. En la app: Panel Competidores -> "Importar CSV" -> pega el contenido
   o sube el archivo -> "Vista previa" -> "Importar".

EJEMPLO
-------
  nombre,documento,genero,fecha_nacimiento,peso,cinturon,club,pais,modalidad
  Garcia Juan,12345678,M,2005-03-15,67.5,azul,Dojo Sakura,Argentina,kumite
  Lopez Maria,,F,2008-07-22,52,verde,Club Bushido,Chile,kata
  Torres Pedro,87654321,M,2007-11-01,60,marron,Dojo Sakura,Argentina,ambos
