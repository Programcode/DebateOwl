import type { LocalizedToolsCopy } from './copy-types';

export const COPY_ES: LocalizedToolsCopy = {
  modified: '2026-10-26',
  tools: {
    '/tools/debate-timer': {
      name: 'Cronómetro de debate',
      blurb: 'Cronómetro de rondas para PF, LD, Policy, BP, World Schools y Asian Parliamentary, con tiempo protegido, aviso de POI y reservas de preparación.',
    },
    '/tools/debate-motion-generator': {
      name: 'Generador de mociones de debate',
      blurb: 'Saca una moción de práctica, o tres para un ejercicio de veto, de un banco de mociones originales en inglés ordenadas por tema y dificultad.',
    },
    '/tools/debate-flow-sheet': {
      name: 'Hoja de flujo de debate',
      blurb: 'Una hoja de flujo imprimible de una página, con una columna por discurso de tu formato, en A4 o Carta.',
    },
    '/tools/speech-time-calculator': {
      name: 'Calculadora de duración de discursos',
      blurb: 'Pega un discurso para ver cuánto tardas en pronunciarlo y en qué turnos de debate cabe.',
    },
  },
  pages: {
    '/tools': {
      title: 'Herramientas de debate gratis',
      intro: 'Herramientas para practicar debate que funcionan en cualquier navegador y no necesitan cuenta. El cronómetro guarda tu ronda en este navegador, no en un servidor. Úsalas en una sesión del club o proyectadas en clase.',
      sections: [
        {
          heading: 'Para qué sirve cada herramienta',
          paragraphs: [
            'El [cronómetro de debate](/tools/debate-timer) lleva una ronda completa: conoce el orden y la duración de los discursos de seis formatos de liga y del formato escolar 4-6-6-3, muestra los minutos protegidos en que no se admiten puntos de información y lleva una reserva de preparación para cada lado. Los entrenadores pueden crear su propio formato y compartirlo como enlace.',
            'El [generador de mociones](/tools/debate-motion-generator) saca mociones de un banco de {total} mociones de práctica escritas para este sitio, con redacción «Esta Casa» (This House) y «Resolved». Las mociones están en inglés: sirven para practicar debate en inglés o para traducirlas en clase.',
            'La [hoja de flujo](/tools/debate-flow-sheet) imprime una página con una columna por discurso del formato que elijas, y la [calculadora de duración de discursos](/tools/speech-time-calculator) te dice cuánto tardas en pronunciar un discurso escrito y en qué turnos cabe.',
            'Las cuatro herramientas comparten los mismos datos de formatos, tomados de las reglas de la NSDA, la WUDC, el WSDC y la UADC, así que una ronda de Public Forum tiene los mismos discursos en el cronómetro, en la hoja de flujo y en la calculadora.',
          ],
        },
      ],
      faq: [],
      cta: {
        title: 'Cuando necesitas algo más que un reloj',
        body: '{product} es una app de preparación y práctica de debate con IA: redacta casos para cualquiera de los dos lados de una moción, sugiere refutaciones y organiza rondas de Sparring contra un oponente de IA.',
      },
    },

    '/tools/debate-timer': {
      title: 'Cronómetro de debate gratis para todos los formatos',
      intro: 'Elige un formato y el cronómetro ya conoce el orden de los discursos, los minutos protegidos y el tiempo de preparación de cada lado. No necesita cuenta, funciona por completo en esta pestaña y conserva tu ronda si la página se recarga.',
      sections: [
        {
          heading: 'Cómo llevar una ronda',
          steps: [
            'Elige el formato. Los botones de discurso de arriba siguen el orden oficial y llevan el color de cada lado.',
            'Pulsa Iniciar, o la barra espaciadora, cuando empiece el orador. Vuelve a pulsar para pausar si hay un problema técnico: el reloj guarda el tiempo exacto que falta.',
            'Pasa al discurso siguiente con el botón de flecha o con la flecha derecha del teclado. Cada discurso empieza con el reloj completo; las reservas de preparación se mantienen.',
            'Entre discursos, toca la reserva de preparación de un lado cuando ese equipo empiece a preparar, y vuelve a tocarla cuando se levante a hablar.',
            'Proyecta el cronómetro con Pantalla completa para que los oradores vean el reloj desde el frente del aula.',
          ],
          paragraphs: [
            'Teclado: haz clic primero en el cronómetro; después, Espacio inicia y pausa, R reinicia un discurso en pausa y las flechas izquierda y derecha cambian de discurso. La pantalla se mantiene encendida mientras corre el reloj, si el navegador lo permite.',
          ],
        },
        {
          heading: 'Qué señales oyes',
          bullets: [
            'Un golpe cuando se abren los puntos de información, al terminar el primer minuto, y cuando se cierran antes del último. En BP coincide con las señales de 1:00 y 6:00 del manual de la WUDC.',
            'Un pitido cuando queda un minuto, en los discursos que no admiten puntos de información.',
            'Un doble pitido al llegar al tiempo, y cuando se agota una reserva de preparación.',
          ],
          paragraphs: [
            'Silencia el sonido si prefieres dar las señales a mano; los colores siguen cambiando. El reloj se pone ámbar en los últimos 30 segundos y rojo cuando el orador se pasa.',
          ],
        },
        {
          heading: 'Tiempos de cada formato',
          paragraphs: [
            'Los formatos predefinidos usan los tiempos de las reglas de cada liga: la NSDA para Public Forum, Lincoln-Douglas y Policy, el manual de la WUDC para British Parliamentary, las reglas del WSDC para World Schools y el manual de la UADC para Asian Parliamentary, además del formato escolar 4-6-6-3. Cada torneo puede cambiarlos, así que revisa la convocatoria antes de competir y, si tus tiempos son otros, ajústalos con Crear un formato personalizado.',
            'Como la [hoja de flujo](/tools/debate-flow-sheet) y la [calculadora de duración de discursos](/tools/speech-time-calculator) usan los mismos datos de formatos, el cronómetro, la hoja y la calculadora coinciden discurso por discurso.',
          ],
        },
        {
          heading: 'Ejercicios con el cronómetro',
          subsections: [
            {
              heading: 'Treinta segundos menos',
              paragraphs: [
                'Crea un formato personalizado con cada discurso 30 segundos más corto que el real y da el mismo discurso. Lo que hayas tenido que recortar es lo que deberías haber pesado menos. Hazlo dos veces antes de un torneo y tus discursos reales terminarán con margen para un resumen en vez de con prisas. Para preparar el texto, la [calculadora de duración de discursos](/tools/speech-time-calculator) te dice si cabe en el turno y cuánto te sobra o te pasas.',
              ],
            },
            {
              heading: 'Abrir en el minuto protegido',
              paragraphs: [
                'En BP o World Schools, practica decir tu hoja de ruta y tu primer argumento antes del golpe de 1:00, cuando nadie puede interrumpirte. Haz el discurso del Primer Ministro o de la primera Proposición y detén el reloj al oír el golpe: si todavía te estás presentando, reescribe el comienzo.',
              ],
            },
            {
              heading: 'Presupuesto de preparación',
              paragraphs: [
                'En Public Forum cada equipo tiene tres minutos para toda la ronda. Antes de una ronda de práctica, decide con tu compañero cómo gastarlos, por ejemplo un minuto antes del resumen y dos antes del enfoque final, y usa la reserva según ese plan. Los equipos que planifican su preparación dejan de gastarla en la primera refutación.',
              ],
            },
            {
              heading: 'Escalera de POI',
              paragraphs: [
                'Haz un discurso de BP de siete minutos mientras un compañero ofrece un punto de información cada vez que el reloj pasa un minuto completo dentro del tiempo abierto. Acepta dos y rechaza el resto con educación. El manual de la WUDC pide que cada orador acepte al menos uno, así que aprende a aceptarlo donde te convenga.',
              ],
            },
          ],
        },
      ],
      faq: [
        {
          question: '¿Qué formatos de debate conoce el cronómetro?',
          answer: 'Public Forum, Lincoln-Douglas y Policy tal como los organiza la NSDA, British Parliamentary según el manual de la WUDC, World Schools según las reglas del WSDC, Asian Parliamentary según el manual de la UADC y el formato escolar 4-6-6-3. Para cualquier otro, crea un formato personalizado y comparte su enlace.',
        },
        {
          question: '¿Cómo muestra el cronómetro el tiempo protegido?',
          answer: 'En los discursos de British Parliamentary, World Schools y Asian Parliamentary, una franja bajo el reloj muestra el primer y el último minuto protegidos y el tramo abierto entre ellos, con una marca donde va el orador. Una etiqueta indica «POI abiertos» o «Tiempo protegido», y suena un golpe cuando el tiempo abierto empieza y cuando termina.',
        },
        {
          question: '¿Qué pasa cuando un orador se pasa de tiempo?',
          answer: 'El reloj sigue contando, ahora hacia arriba, con un signo más y en rojo, para que el juez vea exactamente cuánto se pasó el orador. En BP y Asian Parliamentary muestra primero los 15 segundos de gracia que permiten esas reglas.',
        },
        {
          question: '¿Cómo funcionan las reservas de preparación?',
          answer: 'Las rondas de Public Forum, Lincoln-Douglas y Policy tienen una reserva por lado, con los 3, 4 y 8 minutos que concede la NSDA. Toca la reserva de un lado para ponerla en marcha y vuelve a tocarla para detenerla. Al iniciar una reserva se pausa el discurso, y una reserva que se agota se queda en cero.',
        },
        {
          question: '¿Pierdo la ronda si recargo la página?',
          answer: 'No. El cronómetro guarda el formato, el discurso en curso y las dos reservas de preparación en este navegador, con la hora real, así que un discurso en marcha sigue en el punto correcto después de recargar. La ronda guardada se queda en tu navegador; no se sube a ningún sitio.',
        },
      ],
      cta: {
        title: '¿Quieres un oponente contra quien practicar?',
        body: 'Las rondas de Sparring de {product} te enfrentan a un oponente de IA en Public Forum, Lincoln-Douglas o el formato escolar 4-6-6-3, con el cronómetro de discursos incluido, y el juez puntúa la ronda cuando terminas.',
      },
    },

    '/tools/debate-motion-generator': {
      title: 'Generador de mociones de debate',
      intro: 'Saca una moción de práctica, o tres para un ejercicio de veto, de {total} mociones originales repartidas en doce temas. Filtra por dificultad y tipo de moción, y cambia entre la redacción «Esta Casa» (This House) para BP y World Schools y la redacción «Resolved» para los formatos de Estados Unidos. Las mociones están en inglés: sirven para practicar debate en inglés o para traducirlas en clase.',
      sections: [
        {
          heading: 'Cómo usar el generador',
          steps: [
            'Deja los filtros vacíos para sacar de todo el banco, o elige temas, una dificultad y un tipo de moción. Puedes marcar varios de cada uno.',
            'Pulsa Sacar una moción para una sola ronda, o Sacar tres para elegir entre varias.',
            'Pulsa Copiar moción para pegarla en el documento de la ronda, o Copiar enlace para enviar la misma moción a tu equipo.',
          ],
          paragraphs: [
            'Los filtros se quedan en la dirección de la página, así que un entrenador puede guardar en marcadores «mociones de política educativa para principiantes» y reutilizarlas cada semana.',
          ],
        },
        {
          heading: 'Leer la moción antes de preparar',
          paragraphs: [
            'Dedica el primer minuto de preparación a la moción en sí. ¿Quién es el actor y qué se le pide que haga o que crea? Una moción de política («Esta Casa haría obligatorio el voto») pone en el Gobierno la carga de demostrar que el cambio compensa sus costes. Una moción de valor («Esta Casa cree que la herencia es injusta») se gana con principios y comparación, no con un mecanismo. Una moción de lamento te pide imaginar el mundo sin esa cosa, y una de preferencia te pide comparar dos mundos, y ambos hay que describirlos con justicia.',
            'Las mociones de actor son las que más se malinterpretan. «Esta Casa, como grupo ecologista, usaría protestas disruptivas» no es un debate sobre si la protesta es buena para la sociedad, sino sobre si sirve a los objetivos de ese grupo.',
          ],
        },
        {
          heading: 'Ejercicios con el generador',
          subsections: [
            {
              heading: 'Elección de moción y veto',
              paragraphs: [
                'Saca tres mociones. Da a cada equipo dos minutos para ordenarlas en privado y deja que cada lado vete una. Se debate la que quede. El ejercicio enseña a los equipos a juzgar rápido qué mociones les favorecen, algo que importa en cualquier formato con elección de moción.',
              ],
            },
            {
              heading: 'Improvisado de quince minutos',
              paragraphs: [
                'Filtra por Principiante o Intermedio, saca una moción y pon en el [cronómetro de debate](/tools/debate-timer) un formato personalizado con 15 minutos de preparación, el mismo tiempo que tienen los equipos de British Parliamentary. Los discursos van justo después.',
              ],
            },
            {
              heading: 'La misma moción, los dos lados',
              paragraphs: [
                'Saca una moción avanzada y pide a cada debatiente que escriba la mejor apertura para los dos lados antes de que nadie hable. Si un lado parece imposible, has encontrado el choque: ahí se decidirá la ronda. Pega cada apertura en la [calculadora de duración de discursos](/tools/speech-time-calculator) para comprobar que cabe en el turno.',
              ],
            },
            {
              heading: 'Cambio de redacción',
              paragraphs: [
                'Cambia una moción a su forma «Resolved» y compara. «This House regrets the rise of dating apps» y «Resolved: The rise of dating apps has done more harm than good» plantean casi la misma pregunta, pero la segunda hace explícito el balance entre daños y beneficios. Los debatientes que se mueven entre los formatos de Estados Unidos y los parlamentarios deberían practicar la lectura de ambas.',
              ],
            },
          ],
        },
      ],
      faq: [
        {
          question: '¿De dónde salen estas mociones?',
          answer: 'Las {total} se escribieron para esta página como material de práctica. Ninguna está copiada de un archivo de mociones de torneo, así que puedes usarlas en clase o en el club sin preguntarte si tus estudiantes ya han debatido esa ronda. Están en inglés: sirven para practicar debate en inglés o para traducirlas en clase.',
        },
        {
          question: '¿Qué diferencia hay entre THW, THBT y THR?',
          answer: 'This House would (THW, «Esta Casa haría») propone una política, y el Gobierno debe demostrar que debería aplicarse. This House believes that (THBT, «Esta Casa cree que») pregunta si una afirmación es verdadera o correcta. This House regrets (THR, «Esta Casa lamenta») compara el mundo con algo y el mundo sin ello. Las mociones de actor («Esta Casa, como alcalde de una ciudad, haría») preguntan qué es mejor para ese actor, no para el mundo.',
        },
        {
          question: '¿Puedo tener las mociones en forma «Resolved» para los formatos de Estados Unidos?',
          answer: 'Sí. Cambia la redacción a «Resolved» y cada moción que saques aparece como resolución, por ejemplo «Resolved: Students should be required to lock their phones in sealed pouches for the whole school day.» Cada resolución se escribió a mano, no se convirtió palabra por palabra.',
        },
        {
          question: '¿Cómo funciona el sorteo de tres mociones?',
          answer: 'El botón Sacar tres elige tres mociones distintas según tus filtros. Úsalo para un ejercicio de veto: cada lado veta una moción y se debate la que queda, como en los torneos que dejan elegir a los equipos. Al volver a sacar se evitan las mociones que acabas de ver mientras queden otras suficientes.',
        },
        {
          question: '¿Puedo compartir una moción con mi equipo?',
          answer: 'Cada moción que sacas tiene un botón Copiar enlace. El enlace abre esta página con esa moción en pantalla y con la misma redacción, así que todo el equipo puede preparar la misma ronda a partir de un solo mensaje.',
        },
        {
          question: '¿Son adecuadas las mociones para estudiantes de secundaria?',
          answer: 'Se escribieron para debatientes de colegio y universidad: ninguna moción pide defender algo cruel y ninguna apunta contra una religión, una etnia o una persona viva. Las mociones para principiantes no necesitan investigación; las avanzadas suponen algo de conocimiento de economía, derecho o política.',
        },
      ],
      cta: {
        title: 'Prepara los dos lados de una moción en {product}',
        body: 'Lleva cualquiera de estas mociones a {product} para generar casos para ambos lados, hacer una lluvia de ideas de argumentos y practicar Sparring contra un oponente de IA que defiende el otro lado.',
      },
    },

    '/tools/debate-flow-sheet': {
      title: 'Hoja de flujo de debate para imprimir',
      intro: 'Elige tu formato y el papel, e imprime una hoja de flujo de una página con una columna por discurso, rotulada con el turno de cada orador y coloreada según el lado, más una franja para notas de las preguntas cruzadas. No hay nada que instalar: el cuadro de impresión de tu navegador crea el PDF.',
      sections: [
        {
          heading: 'Cómo imprimir una hoja',
          steps: [
            'Elige el formato. Las columnas siguen su orden de intervención, y el color de la cabecera de cada columna indica el lado: azul para el lado que habla primero y rojo para el otro.',
            'Elige Carta (EE. UU.) o A4 y la orientación. Horizontal es la opción por defecto porque la mayoría de los formatos tienen más de cinco discursos.',
            'Escribe la moción, la ronda y el juez si quieres que salgan impresos, o deja las líneas en blanco.',
            'Pulsa Imprimir / Guardar como PDF. Antes de un torneo, imprime un montón: una hoja por ronda y algunas de reserva para las eliminatorias.',
          ],
        },
        {
          heading: 'Cómo llevar el flujo de una ronda',
          paragraphs: [
            'Un flujo es un mapa de los argumentos, no una transcripción. Escribe cada argumento, abreviado, en la columna del discurso que lo planteó, y escribe cada respuesta junto al argumento al que contesta, una columna a la derecha. Cuando un discurso posterior extiende o abandona un argumento, la fila lo muestra.',
            'En una ronda de Public Forum, la hoja te da 8 columnas y una casilla para cada una de las 3 rondas de preguntas cruzadas. Anota el primer constructivo en la primera columna; cuando empiece la refutación del Equipo B, la cuarta columna debería quedar alineada, fila por fila, frente al caso del Equipo A. Si una fila está vacía en la columna del resumen, ese argumento se abandonó, y el enfoque final debería decirlo.',
          ],
        },
        {
          heading: 'Hábitos que hacen útil un flujo',
          bullets: [
            'Abrevia siempre igual. Elige símbolos y mantenlos: una flecha hacia arriba para un aumento, una delta para un cambio, una X en un círculo para un argumento abandonado y «T/» para un giro (turn).',
            'Deja espacio. Empieza cada argumento nuevo más abajo de lo que crees necesario, para que las respuestas tengan sitio al lado.',
            'Numera los argumentos. «Su 2» es más rápido de escribir y de decir en un discurso que un resumen del argumento.',
            'Anota en la franja de abajo las respuestas de las preguntas cruzadas que vayas a usar, con el discurso al que corresponden, para poder citarlas en el discurso siguiente.',
            'Anota también a tu propio lado. El discurso de tu compañero forma parte del mapa; no puedes extender lo que no escribiste.',
          ],
        },
        {
          heading: 'Un ejercicio de flujo',
          paragraphs: [
            'Saca una moción con el [generador de mociones](/tools/debate-motion-generator) y haz un discurso con el [cronómetro de debate](/tools/debate-timer) mientras dos compañeros lo anotan en hojas impresas. Después, compara los dos flujos con las notas del orador. Cada argumento que el orador planteó y alguien no anotó es un problema de toma de notas o de señalización, y el orador suele aprender tanto como quienes anotaron.',
          ],
        },
      ],
      faq: [
        {
          question: '¿Cómo guardo la hoja de flujo como PDF?',
          answer: 'Pulsa Imprimir / Guardar como PDF y elige «Guardar como PDF» (o «Microsoft Print to PDF») como impresora. La página fija el tamaño del papel y la orientación por ti, así que la hoja ocupa una sola página. Activa los gráficos de fondo si tu navegador oculta las líneas para escribir.',
        },
        {
          question: '¿Por qué hay una columna por discurso?',
          answer: 'Llevar el flujo significa seguir cada argumento a lo largo de la ronda. Escribir cada discurso en su propia columna, en orden de intervención, te permite trazar una línea desde un argumento hasta cada respuesta que recibe y ver de un vistazo qué quedó sin responder.',
        },
        {
          question: '¿Es mejor el papel horizontal o el vertical?',
          answer: 'Horizontal va bien para los formatos con muchos discursos: Policy tiene ocho columnas y Public Forum otras ocho, así que cada columna queda lo bastante ancha para escribir. Vertical sirve para Lincoln-Douglas, que tiene cinco discursos, o cuando anotas cada lado en su propia hoja.',
        },
        {
          question: '¿Qué va en la franja de abajo?',
          answer: 'En Public Forum, Lincoln-Douglas y Policy, una casilla por cada periodo de preguntas cruzadas (crossfire o cross-examination), para las respuestas que quieras usar después. Los formatos parlamentarios no tienen periodos de preguntas, así que la franja se convierte en una sola casilla para los puntos de información y tus notas de la decisión.',
        },
        {
          question: '¿Puedo escribir la moción y el nombre del juez en la hoja?',
          answer: 'Sí. Lo que escribas en las casillas de moción, ronda y juez sale impreso en la cabecera. Si las dejas vacías, la hoja imprime líneas en blanco para rellenar a mano.',
        },
      ],
      cta: {
        title: 'Mapea una ronda en pantalla',
        body: 'El Diagrama de argumentos de {product} te permite organizar afirmaciones y respuestas en un diagrama que puedes editar y exportar, junto a herramientas de IA que redactan casos y refutaciones para cualquiera de los dos lados.',
      },
    },

    '/tools/speech-time-calculator': {
      title: '¿Cuánto dura mi discurso? Calculadora de duración de discursos',
      intro: 'Pega un discurso para ver cuántas palabras tiene, cuánto tardas en pronunciarlo a ritmo lento, medio o rápido y en qué turnos de debate cabe. Todo funciona en tu navegador; el texto nunca sale de esta página.',
      sections: [
        {
          heading: 'Cómo funciona la calculadora',
          paragraphs: [
            'Cuenta las palabras como lo haría un lector: «franco-alemán» y «2026» cuentan como una palabra cada una, y las viñetas y los guiones sueltos no cuentan. Después divide entre un ritmo de habla. Lento son 110 palabras por minuto, medio 130 y rápido 160; pon tu propio ritmo en la cuarta casilla, Tu ritmo.',
            'Estos ritmos son aproximaciones para planificar, no cifras de investigación. Los oradores nerviosos suelen hablar más rápido en una ronda que en la práctica, y un discurso lleno de cifras o nombres tarda más de lo que sugiere su número de palabras.',
          ],
        },
        {
          heading: 'En qué turnos cabe tu discurso',
          paragraphs: [
            'Escribir con una meta es más fácil que recortar después. La lista de turnos de la calculadora usa los mismos datos de formatos que el [cronómetro de debate](/tools/debate-timer), con los tiempos de las reglas de la NSDA, la WUDC, el WSDC y la UADC, y te dice para cada turno cuánto tiempo te sobra o cuánto te pasas al ritmo que elijas.',
          ],
        },
        {
          heading: 'Cómo recortar un discurso demasiado largo',
          steps: [
            'Quita primero los rodeos. Los agradecimientos, repetir la moción y «ahora paso a» cuestan segundos y no ganan nada.',
            'Junta los ejemplos. Un ejemplo bien explicado vale más que tres enumerados.',
            'Conserva la ponderación. Si algo tiene que irse, recorta la descripción antes que la comparación. Los jueces deciden según por qué tu argumento importa más, así que esa frase se queda.',
            'Vuelve a cronometrarlo en voz alta. Pega el nuevo borrador y pronúncialo con el cronómetro. La estimación te acerca; la exposición te dice la verdad.',
          ],
        },
        {
          heading: 'Un ejercicio de ritmo',
          paragraphs: [
            'Toma un texto de 400 palabras. Léelo una vez a tu ritmo natural con el [cronómetro de debate](/tools/debate-timer), otra intentando que dure exactamente tres minutos y otra para dos minutos y medio. Quien sabe cambiar de ritmo a propósito puede ir más despacio en la frase que importa y más rápido en el resumen, y eso vale más que cualquier ritmo fijo. Para planificar qué va en cada minuto, imprime una [hoja de flujo](/tools/debate-flow-sheet) del formato y anota en ella la estructura del discurso.',
          ],
        },
      ],
      faq: [
        {
          question: '¿Se envía mi discurso a algún sitio?',
          answer: 'No. El número de palabras y las duraciones los calcula tu navegador mientras escribes. El texto nunca se sube ni se guarda, nadie más lo ve y desaparece cuando cierras la pestaña.',
        },
        {
          question: '¿Qué precisión tienen las duraciones?',
          answer: 'Son estimaciones. Las cifras de 110, 130 y 160 palabras por minuto son aproximaciones prácticas para un ritmo lento, medio y rápido, no normas medidas, y tu ritmo real depende de las pausas, el énfasis y cuánto improvises. Cronométrate una vez leyendo un párrafo en voz alta y ajusta Tu ritmo para que coincida.',
        },
        {
          question: '¿Cómo calculo mi propio ritmo de habla?',
          answer: 'Pega un texto de unas 260 palabras, léelo en voz alta a ritmo de discurso mientras corre el cronómetro de debate y divide el número de palabras entre los minutos que tardaste. Escribe ese número en Tu ritmo y la calculadora lo usará para todos los turnos.',
        },
        {
          question: '¿Por qué muestra varios formatos?',
          answer: 'Para que veas de una vez si un borrador cabe en el turno para el que escribes. Cada fila es una duración de discurso en un formato, como los 4:00 del constructivo y la refutación de Public Forum, con el tiempo que te sobra o el que te pasas al ritmo que elijas.',
        },
        {
          question: '¿Debe un discurso escrito ocupar todo el turno?',
          answer: 'Casi nunca. Deja margen para las respuestas que añadirás en la ronda, para los puntos de información en los formatos parlamentarios y para ir más despacio en tu frase clave. Una regla práctica es escribir un discurso preparado entre un 10 y un 20 por ciento más corto que el turno.',
        },
      ],
      cta: {
        title: 'Practica el discurso en voz alta con un compañero de Sparring',
        body: 'Las rondas de Sparring de {product} te dejan dar un discurso cronometrado, recibir la respuesta de un oponente de IA y que el juez puntúe la ronda, para que pongas a prueba un borrador frente a respuestas reales y no solo frente al reloj.',
      },
    },
  },
};
