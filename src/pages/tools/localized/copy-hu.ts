import type { LocalizedToolsCopy } from './copy-types';

export const COPY_HU: LocalizedToolsCopy = {
  modified: '2026-10-26',
  tools: {
    '/tools/debate-timer': {
      name: 'Vitaidőmérő',
      blurb: 'Fordulóidőmérő PF, LD, Policy, BP, World Schools és Asian Parliamentary formátumhoz, védett idővel, POI-jelzéssel és felkészülési keretekkel.',
    },
    '/tools/debate-motion-generator': {
      name: 'Vitatétel-generátor',
      blurb: 'Húzz egy gyakorló tételt, vagy hármat vétógyakorlathoz, 300 eredeti, angol nyelvű tételből, téma és nehézség szerint.',
    },
    '/tools/debate-flow-sheet': {
      name: 'Vitajegyzetlap',
      blurb: 'Nyomtatható, egyoldalas jegyzetlap (flow), a formátumod minden beszédének külön oszloppal, A4-es vagy Letter méretben.',
    },
    '/tools/speech-time-calculator': {
      name: 'Beszédidő-kalkulátor',
      blurb: 'Illeszd be a beszédedet, és megtudod, mennyi ideig tart elmondani, és mely beszédidőkbe fér bele.',
    },
  },
  pages: {
    '/tools': {
      title: 'Ingyenes vitaeszközök',
      intro: 'Eszközök a vitagyakorláshoz, amelyek bármelyik böngészőben működnek, és nem kell hozzájuk fiók. Az időmérő a fordulódat ebben a böngészőben menti, nem szerveren. Használd őket szakköri foglalkozáson vagy kivetítve az osztályteremben.',
      sections: [
        {
          heading: 'Melyik eszköz mire való',
          paragraphs: [
            'A [vitaidőmérő](/tools/debate-timer) egy teljes fordulót levezet: ismeri hat versenyformátum és az iskolai 4-6-6-3 formátum beszédsorrendjét és beszédidejét, mutatja a védett perceket, amikor nem lehet közbekérdezni, és mindkét oldalnak külön felkészülési keretet vezet. Az edzők saját formátumot is összeállíthatnak, és linkként megoszthatják.',
            'A [vitatétel-generátor](/tools/debate-motion-generator) {total} gyakorló tételből húz, amelyeket ehhez az oldalhoz írtunk, „This House” és „Resolved” megfogalmazással. A tételek angol nyelvűek: angol nyelvű vitához gyakorolhatsz velük, vagy órán lefordíthatjátok őket.',
            'A [jegyzetlap](/tools/debate-flow-sheet) a választott formátumhoz nyomtat egy lapot, beszédenként egy oszloppal, a [beszédidő-kalkulátor](/tools/speech-time-calculator) pedig megmondja, mennyi ideig tart elmondani egy megírt beszédet, és mely beszédidőkbe fér bele.',
            'A négy eszköz ugyanazokat a formátumadatokat használja, az NSDA, a WUDC, a WSDC és az UADC szabályai alapján, így egy Public Forum-fordulóban ugyanazok a beszédek szerepelnek az időmérőn, a jegyzetlapon és a kalkulátorban.',
          ],
        },
      ],
      faq: [],
      cta: {
        title: 'Ha már nem csak időmérőre van szükséged',
        body: 'A {product} fizetős gyakorlóalkalmazás vitázóknak: egy tétel bármelyik oldalára megírja az eset vázlatát, cáfolatokat javasol, és Vitapárbaj-fordulókat futtat egy MI-ellenféllel.',
      },
    },

    '/tools/debate-timer': {
      title: 'Ingyenes vitaidőmérő minden formátumhoz',
      intro: 'Válassz formátumot, és az időmérő már tudja a beszédek sorrendjét, a védett perceket és az oldalak felkészülési idejét. Nem kell hozzá fiók, teljes egészében ebben a böngészőlapon fut, és az oldal újratöltése után is megtartja a fordulót.',
      sections: [
        {
          heading: 'Így vezess le vele egy fordulót',
          steps: [
            'Válaszd ki a formátumot. A felső beszédgombok a hivatalos sorrendet követik, és oldalanként más a színük.',
            'Amikor a beszélő elkezdi, nyomd meg az Indítás gombot vagy a szóközt. Technikai gond esetén nyomd meg újra a szüneteltetéshez: az óra pontosan megőrzi a hátralévő időt.',
            'A következő beszédre a nyíl gombbal vagy a jobb nyílbillentyűvel lépsz. Minden beszéd tiszta órával indul, a felkészülési keretek viszont megmaradnak.',
            'Beszédek között koppints az egyik oldal felkészülési keretére, amikor az az oldal elkezd készülni, és koppints újra, amikor a beszélő feláll.',
            'Vetítsd ki az időmérőt a Teljes képernyő gombbal, hogy a beszélők a terem elejéről is lássák az órát.',
          ],
          subsections: [
            {
              heading: 'Billentyűparancsok',
              paragraphs: [
                'Előbb kattints az időmérőre. Utána a szóköz indít és megállít, az R nullázza a szüneteltetett beszédet, a bal és a jobb nyílbillentyű pedig beszédet vált. Amíg fut az óra, nem kapcsol ki a képernyő, ha a böngésző engedi.',
              ],
            },
          ],
        },
        {
          heading: 'Mit hallasz és mit látsz',
          paragraphs: [
            'Az óra az utolsó 30 másodpercben sárgára, időtúllépésnél pirosra vált. Ha inkább kézzel jeleznél, kapcsold ki a hangot; a színek akkor is váltanak. A hangjelzések:',
          ],
          bullets: [
            'Kopogás, amikor az első perc után megnyílik a közbekérdezés (POI) lehetősége, és amikor az utolsó perc előtt lezárul. BP-ben ez megfelel a WUDC-kézikönyv 1:00-s és 6:00-s jelzésének.',
            'Egy sípszó, amikor egy perc van hátra az olyan beszédekből, amelyekben nincs közbekérdezés.',
            'Dupla sípszó, amikor lejár az idő, és amikor elfogy egy felkészülési keret.',
          ],
        },
        {
          heading: 'Beszédidők formátumonként',
          paragraphs: [
            'Az előbeállítások a ligák saját szabályait követik: a Public Forum, a Lincoln-Douglas és a Policy az NSDA kézikönyvét, a British Parliamentary a WUDC-kézikönyvet, a World Schools a WSDC szabályait, az Asian Parliamentary az UADC kézikönyvét. A versenyek ettől eltérhetnek, ezért verseny előtt nézd meg a kiírást, és ha a tiéd más, állítsd be saját formátumként.',
          ],
          bullets: [
            'Public Forum: 4 perces nyitóbeszédek (constructive), 3 perces crossfire, 4 perces cáfolatok (rebuttal), újabb 3 perces crossfire, 3 perces összegzések (summary), 3 perces grand crossfire, végül 2 perces final focus. Csapatonként 3 perc felkészülési idő.',
            'Lincoln-Douglas: 6 perces affirmatív nyitóbeszéd, 3 perc keresztkérdés, 7 perces negatív nyitóbeszéd, 3 perc keresztkérdés, majd 4, 6 és 3 perces cáfolatok. Oldalanként 4 perc felkészülés.',
            'Policy: négy 8 perces konstruktív beszéd, mindegyik után 3 perc keresztkérdés, majd négy 5 perces cáfolat. Csapatonként 8 perc felkészülés.',
            'British Parliamentary: nyolc 7 perces beszéd, közbekérdezés 1:00 és 6:00 között, 15 másodperc türelmi idő. A csapatok a tétel kihirdetése után, a forduló előtt kapnak 15 percet a felkészülésre.',
            'World Schools: hat 8 perces beszéd, közbekérdezés az első és az utolsó perc kivételével, majd két 4 perces válaszbeszéd (reply), előbb az Opposition, közbekérdezés nélkül.',
            'Asian Parliamentary: hat 7 perces beszéd és két 4 perces válaszbeszéd, 15 másodperc türelmi idő; az UADC kézikönyve szerint a forduló előtt 30 perc a felkészülés.',
            'Iskolai 4-6-6-3: oldalanként 4 perces bevezető, 6 perces első cáfolat (az időmérőn R1), 6 perces második cáfolat (R2) és 3 perces záróbeszéd, fordulón belüli felkészülési idő nélkül.',
          ],
        },
        {
          heading: 'Időmérős gyakorlatok',
          subsections: [
            {
              heading: 'Harminc másodperccel rövidebben',
              paragraphs: [
                'Állíts be saját formátumot, amelyben minden beszéd 30 másodperccel rövidebb a valódinál, és mondd el ugyanazt a beszédet. Amit ki kellett húznod, arra eleve kevesebb súlyt kellett volna fektetned. Csináld meg kétszer egy verseny előtt, és a valódi beszédeid végén marad idő az összegzésre, nem kapkodsz.',
              ],
            },
            {
              heading: 'Nyitás a védett percben',
              paragraphs: [
                'BP-ben vagy World Schoolsban gyakorold, hogy a beszéd vázlatát és az első érvedet az 1:00-s kopogás előtt mondod el, amikor senki nem szakíthat félbe. Indítsd el a PM vagy az első Proposition-beszédet, és állítsd meg az órát a kopogásnál: ha még mindig a bevezetésnél tartasz, írd át a nyitást.',
              ],
            },
            {
              heading: 'A felkészülési keret beosztása',
              paragraphs: [
                'A Public Forum-csapatoknak az egész fordulóra három perc jut. Gyakorlóforduló előtt beszéljétek meg, hogyan osztjátok be, például egy percet az összegzés előtt és kettőt a final focus előtt, és ehhez a tervhez mérve futtassátok a keretet. Azok a csapatok, amelyek beosztják a felkészülési idejüket, nem élik fel már az első cáfolatnál.',
              ],
            },
            {
              heading: 'POI-létra',
              paragraphs: [
                'Mondj el egy hétperces BP-beszédet, miközben a társad a nyitott szakaszban percenként felajánl egy közbekérdezést. Kettőt fogadj el, a többit udvariasan utasítsd el. A WUDC-kézikönyv azt kéri, hogy minden beszélő fogadjon el legalább egyet, ezért tanuld meg ott elfogadni, ahol neked jól jön.',
              ],
            },
          ],
        },
        {
          heading: 'Az időmérő mellé',
          paragraphs: [
            'Nyomtass [jegyzetlapot](/tools/debate-flow-sheet) ugyanahhoz a formátumhoz, így az időmérő és a jegyzetlap beszédről beszédre egyezik. Ha előre megírod a beszédedet, a [beszédidő-kalkulátor](/tools/speech-time-calculator) megmutatja, belefér-e az idődbe, a gyakorlóforduló tételét pedig a [vitatétel-generátorból](/tools/debate-motion-generator) húzhatod.',
          ],
        },
      ],
      faq: [
        {
          question: 'Mely vitaformátumokat ismeri az időmérő?',
          answer: 'A Public Forumot, a Lincoln-Douglast és a Policyt az NSDA szabályai szerint, a British Parliamentaryt a WUDC-kézikönyv, a World Schoolst a WSDC szabályai, az Asian Parliamentaryt az UADC kézikönyve szerint, valamint az iskolai 4-6-6-3 formátumot. Minden máshoz készíts saját formátumot, és oszd meg a linkjét.',
        },
        {
          question: 'Hogyan mutatja az időmérő a védett időt?',
          answer: 'A British Parliamentary, a World Schools és az Asian Parliamentary beszédeinél az óra alatti sáv mutatja a védett első és utolsó percet, köztük a nyitott szakaszt, egy jelölő pedig azt, hol tart a beszélő. Egy címke „POI nyitva” vagy „Védett idő” feliratot mutat, és kopogás hallatszik, amikor az ablak megnyílik és bezárul.',
        },
        {
          question: 'Mi történik, ha a beszélő túllépi az idejét?',
          answer: 'Az óra tovább számol, de már felfelé, pluszjellel és pirosan, így a bíró pontosan látja, mennyivel lépte túl a beszélő az időt. BP-ben és Asian Parliamentaryben előbb a szabályok szerinti 15 másodperces türelmi időt mutatja.',
        },
        {
          question: 'Hogyan működnek a felkészülési keretek?',
          answer: 'Public Forum-, Lincoln-Douglas- és Policy-fordulóban mindkét oldal saját keretet kap, az NSDA szerinti 3, 4, illetve 8 perccel. Koppints az oldal keretére az indításhoz, és újra a leállításhoz. Ha elindítasz egy keretet, a beszéd szünetel, az elfogyott keret pedig nullán megáll.',
        },
        {
          question: 'Elvész a forduló, ha újratöltöm az oldalt?',
          answer: 'Nem. Az időmérő ebben a böngészőben menti a formátumot, az aktuális beszédet és mindkét felkészülési keretet, a valós időhöz igazítva, így egy futó beszéd újratöltés után is a helyes időnél jár. A mentett forduló a böngésződben marad, nem töltjük fel.',
        },
      ],
      cta: {
        title: 'Ellenfelet keresel a gyakorláshoz?',
        body: 'A {product} Vitapárbaj-fordulóiban egy MI-ellenféllel vitázol Public Forum, Lincoln-Douglas vagy iskolai 4-6-6-3 formátumban, beépített beszédórával, és a forduló végén értékelést kapsz.',
      },
    },

    '/tools/debate-motion-generator': {
      title: 'Vitatétel-generátor',
      intro: 'Húzz egy gyakorló tételt, vagy hármat egy vétógyakorlathoz, {total} eredeti tételből, tizenkét témában. Szűrhetsz nehézség és tételtípus szerint, és választhatsz a BP-ben és World Schoolsban használt „This House” és az amerikai formátumok „Resolved” megfogalmazása között. A tételek angol nyelvűek: angol nyelvű vitához gyakorolhatsz velük, vagy órán lefordíthatjátok őket.',
      sections: [
        {
          heading: 'Így használd a generátort',
          steps: [
            'Hagyd üresen a szűrőket, ha mindenből húznál, vagy válassz témákat, nehézséget és tételtípust. Mindegyikből többet is kijelölhetsz.',
            'Nyomd meg az Egy tétel húzása gombot egy fordulóhoz, vagy a Három tétel húzását, ha választani akartok.',
            'A Tétel másolása gombbal tedd be a tételt a forduló dokumentumába, vagy a Link másolása gombbal küldd el a csapatodnak. A link ugyanezt az oldalt nyitja meg ugyanazzal a tétellel és megfogalmazással, így az egész csapat egyetlen üzenetből ugyanarra a fordulóra készülhet.',
          ],
          subsections: [
            {
              heading: 'A szűrők a webcímben maradnak',
              paragraphs: [
                'A szűrők bekerülnek az oldal webcímébe, így egy edző könyvjelzőbe teheti például a kezdő szintű, oktatási témájú intézkedési tételeket, és minden héten újra használhatja.',
              ],
            },
          ],
        },
        {
          heading: 'Angol nyelvű tételek',
          paragraphs: [
            'A generátor mind a {total} tétele angolul van, magyar nyelvű tételeket nem tartalmaz. Akkor jönnek jól, ha angol nyelvű versenyre készülsz, például British Parliamentary vagy World Schools formátumban. Magyar nyelvű vitához fordítsátok le a tételt közösen, mielőtt nekiálltok a felkészülésnek.',
          ],
        },
        {
          heading: 'Olvasd el a tételt, mielőtt készülsz',
          paragraphs: [
            'A felkészülés első percét töltsd magával a tétellel. Ki a szereplő, és mit kell tennie vagy gondolnia? Egy intézkedési tételnél („This House would make voting compulsory”, vagyis tegyük kötelezővé a szavazást) a kormányoldalnak kell megmutatnia, hogy a változás megéri a költségeit. Egy értéktételt („This House believes that inheritance is unfair”) elvek és összehasonlítás alapján lehet megnyerni, nem egy mechanizmussal. A sajnálattétel (regret) azt kéri, hogy képzeld el a világot az adott dolog nélkül, a preferenciatétel (prefer) pedig két világ összevetését, és mindkettőt tisztességesen kell leírni.',
            'Leggyakrabban a szereplőt megnevező tételeket értik félre. A „This House, as an environmental group, would use disruptive protests” nem arról szól, hogy jót tesz-e a társadalomnak a zavaró tiltakozás, hanem arról, hogy szolgálja-e a környezetvédő csoport céljait.',
          ],
        },
        {
          heading: 'Gyakorlatok a generátorral',
          paragraphs: [
            'Ezekhez a gyakorlatokhoz jól jön a [vitaidőmérő](/tools/debate-timer) és egy kinyomtatott [jegyzetlap](/tools/debate-flow-sheet); ha előre megírt beszéddel dolgoztok, a [beszédidő-kalkulátor](/tools/speech-time-calculator) megmutatja, belefér-e a beszédidőbe.',
          ],
          subsections: [
            {
              heading: 'Tételválasztás és vétó',
              paragraphs: [
                'Húzz három tételt. Mindkét csapat kap két percet, hogy titokban rangsorolja őket, majd mindkét oldal kizár (megvétóz) egyet. A megmaradt tételről vitáztok. A gyakorlattal a csapatok megtanulják gyorsan felmérni, melyik tétel kedvez nekik, és ez minden olyan formátumban számít, ahol választani lehet a tételek közül.',
              ],
            },
            {
              heading: 'Tizenöt perces rögtönzés',
              paragraphs: [
                'Szűrj kezdő vagy középhaladó szintre, húzz egy tételt, és indíts a [vitaidőmérőn](/tools/debate-timer) egy 15 perces saját felkészülési szakaszt; ennyi felkészülési időt kapnak a British Parliamentary csapatok is. Utána rögtön jönnek a beszédek.',
              ],
            },
            {
              heading: 'Ugyanaz a tétel, mindkét oldal',
              paragraphs: [
                'Húzz egy haladó tételt, és mielőtt bárki megszólalna, mindenki írja meg mindkét oldal legjobb nyitását. Ha az egyik oldal lehetetlennek tűnik, megtaláltad az ütközési pontot: ott dől el a forduló.',
              ],
            },
            {
              heading: 'Megfogalmazáscsere',
              paragraphs: [
                'Váltsd át a tételt Resolved formára, és hasonlítsd össze a kettőt. A „This House regrets the rise of dating apps” és a „Resolved: The rise of dating apps has done more harm than good” szinte ugyanazt kérdezi, de a második kimondja, hogy az ártalmakat és az előnyöket kell mérlegelni. Ha amerikai és parlamenti formátumok között váltasz, gyakorold mindkét forma olvasását.',
              ],
            },
          ],
        },
      ],
      faq: [
        {
          question: 'Honnan származnak a tételek?',
          answer: 'Mind a {total} tételt gyakorlóanyagnak írtuk ehhez az oldalhoz. Egyik sem versenyek tételarchívumából való, így órán vagy szakkörön is használhatod őket anélkül, hogy azon kellene gondolkodnod, látták-e már a diákjaid az adott tételt.',
        },
        {
          question: 'Vannak magyar nyelvű tételek is?',
          answer: 'Nincsenek. Mind a {total} tétel angolul van, „This House” és „Resolved” megfogalmazásban is. Angol nyelvű versenyre készülve közvetlenül használhatod őket; magyar nyelvű vitához fordítsátok le a tételt, mielőtt nekiálltok a felkészülésnek.',
        },
        {
          question: 'Mi a különbség a THW, a THBT és a THR között?',
          answer: 'A This House would (THW) intézkedést javasol, és a kormányoldalnak kell megmutatnia, hogy meg kellene valósulnia. A This House believes that (THBT) azt kérdezi, igaz vagy helyes-e egy állítás. A This House regrets (THR) a világot az adott dologgal és nélküle veti össze. A szereplőt megnevező tételek („This House, as a city mayor, would”) azt kérdezik, mi a legjobb az adott szereplőnek, nem pedig a világnak.',
        },
        {
          question: 'Megkaphatom a tételeket Resolved formában az amerikai formátumokhoz?',
          answer: 'Igen. Válts a Resolved megfogalmazásra, és minden húzott tétel határozatként jelenik meg, például: „Resolved: Students should be required to lock their phones in sealed pouches for the whole school day.” Minden Resolved változatot kézzel írtunk, nem szóról szóra alakítottuk át.',
        },
        {
          question: 'Hogyan működik a háromtételes húzás?',
          answer: 'A Három tétel húzása három különböző tételt húz a szűrőidnek megfelelően. Használd vétógyakorlathoz: mindkét oldal kizár (megvétóz) egyet, és a megmaradtról vitáztok, ahogy egyes versenyeken a csapatok választhatnak. Újabb húzásnál a generátor kerüli az imént látott tételeket, amíg van elég másik.',
        },
        {
          question: 'Alkalmasak a tételek iskolai használatra?',
          answer: 'Iskolai és egyetemi vitázóknak írtuk őket: egyik tétel sem kér senkit arra, hogy kegyetlenséget védjen, és egyik sem irányul vallás, etnikai csoport vagy élő személy ellen. A kezdő tételekhez nem kell utánanézni semminek; a haladók feltételeznek némi közgazdasági, jogi vagy politikai tájékozottságot.',
        },
      ],
      cta: {
        title: 'Készülj fel a tétel mindkét oldalára',
        body: 'Vidd be bármelyik tételt a {product} alkalmazásba: az Esetgenerátor mindkét oldalra esetet ír, az Ötleteléssel érveket gyűjthetsz, a Vitapárbajban pedig egy MI-ellenféllel vitázhatsz, aki a másik oldalt képviseli.',
      },
    },

    '/tools/debate-flow-sheet': {
      title: 'Nyomtatható vitajegyzetlap (flow)',
      intro: 'Válaszd ki a formátumot és a papírt, és nyomtass egyoldalas jegyzetlapot, amit a vitázók flow-nak hívnak: minden beszédnek külön oszlopa van, a beszélő szerepével felcímkézve és az oldal színével jelölve, alul pedig egy sáv a keresztkérdésekhez. Semmit nem kell telepíteni; a PDF-et a böngésződ nyomtatási ablaka készíti el.',
      sections: [
        {
          heading: 'A lap nyomtatása',
          steps: [
            'Válaszd ki a formátumot. Az oszlopok az elhangzás sorrendjét követik, és az oszlopfejléc színe mutatja az oldalt: kék az elsőként felszólaló oldal, piros a másik.',
            'Válassz A4-es vagy Letter méretet és tájolást. Alapból fekvő, mert a legtöbb formátumban ötnél több beszéd van.',
            'Ha szeretnéd, hogy rákerüljön, írd be a tételt, a fordulót és a bírót, vagy hagyd üresen a sorokat.',
            'Nyomd meg a Nyomtatás gombot. Verseny előtt nyomtass egy köteget: fordulónként egy lapot, plusz tartalékot a kieséses szakaszra.',
          ],
        },
        {
          heading: 'Hogyan jegyzeteld a fordulót',
          paragraphs: [
            'A jegyzetlap az érvek térképe, nem leirat. Minden érvet röviden annak a beszédnek az oszlopába írj, amelyik elmondta, és minden választ ahhoz az érvhez, amelyre felel, egy oszloppal jobbra. Ha egy későbbi beszéd továbbviszi vagy elejti az érvet, az a sorban látszik.',
            'Public Forum-fordulóhoz a lap 8 oszlopot ad, és mind a 3 crossfire-nek saját dobozt. Az első nyitóbeszédet az első oszlopba jegyzeteld; mire a B csapat cáfolata elkezdődik, a negyedik oszlopnak soronként az A csapat esete mellett kell állnia. Ha az összegzés oszlopában egy sor üres, azt az érvet elejtették, és a final focusnak ezt ki kell mondania.',
          ],
        },
        {
          heading: 'Szokások, amelyektől használható lesz a jegyzetlap',
          bullets: [
            'Rövidíts következetesen. Válassz jeleket, és tartsd magad hozzájuk: felfelé mutató nyíl a növekedésre, delta a változásra, bekarikázott X az elejtett érvre, „T/” az ellenünk fordított érvre (turn).',
            'Hagyj helyet. Minden új érvet kezdj lejjebb, mint gondolnád, hogy a válaszoknak legyen mellette hely.',
            'Számozd az érveket. „A 2-esük” gyorsabban leírható és beszédben is gyorsabban kimondható, mint az érv összefoglalása.',
            'Az alsó sávba írd fel a keresztkérdésekből azokat a válaszokat, amelyeket fel fogsz használni, azzal együtt, melyik beszédhez tartoznak, így a következő beszédben idézheted őket.',
            'A saját oldaladat is jegyzeteld. A társad beszéde is a térkép része; amit nem írtál le, azt nem tudod továbbvinni.',
          ],
        },
        {
          heading: 'Jegyzetelési gyakorlat',
          paragraphs: [
            'Indíts el egy beszédet a [vitaidőmérőn](/tools/debate-timer), miközben két csapattárs kinyomtatott lapon jegyzeteli. Utána vessétek össze a két jegyzetlapot a beszélő vázlatával. Minden érv, amit a beszélő elmondott, de valamelyik jegyzetelő lemaradt róla, vagy jegyzetelési, vagy tagolási (signposting) hiba, és a beszélő általában annyit tanul belőle, mint a jegyzetelők.',
            'Ha a beszédet előre megírjátok, a [beszédidő-kalkulátor](/tools/speech-time-calculator) megmutatja, belefér-e az idejébe, mielőtt órára elmondanátok.',
          ],
        },
      ],
      faq: [
        {
          question: 'Hogyan menthetem el a jegyzetlapot PDF-ként?',
          answer: 'Nyomd meg a Nyomtatás gombot, és nyomtatóként válaszd a Mentés PDF-ként (vagy a Microsoft Print to PDF) lehetőséget. Az oldal beállítja a papírméretet és a tájolást, így a lap egy oldalt tölt ki. Ha a böngésződ elrejti az írósorokat, kapcsold be a háttérgrafikák nyomtatását.',
        },
        {
          question: 'Miért van minden beszédnek külön oszlopa?',
          answer: 'Jegyzetelni annyit jelent, mint végigkövetni minden érvet a fordulón. Ha minden beszéd saját oszlopba kerül, elhangzási sorrendben, egy érvtől vonalat húzhatsz minden rá adott válaszig, és egy pillantással látod, mit ejtettek el.',
        },
        {
          question: 'Fekvő vagy álló lapon jegyzeteljek?',
          answer: 'A fekvő lap a sok beszédes formátumokhoz való: a Policyben nyolc, a Public Forumban szintén nyolc oszlop van, így mindegyik elég széles marad az íráshoz. Az álló lap a Lincoln-Douglashoz jó, amelyben öt beszéd van, vagy ha mindkét oldalt külön lapra jegyzeteled.',
        },
        {
          question: 'Mi kerül az alsó sávba?',
          answer: 'Public Forumban, Lincoln-Douglasban és Policyben minden crossfire- vagy keresztkérdés-szakasz saját dobozt kap, azoknak a válaszoknak, amelyeket később fel akarsz használni. A parlamenti formátumokban nincs kérdezési szakasz, így ott a sáv egyetlen doboz a közbekérdezéseknek és a bírói döntéshez szükséges jegyzeteknek.',
        },
        {
          question: 'Ráírhatom a lapra a tételt és a bíró nevét?',
          answer: 'Igen. Amit a tétel, a forduló és a bíró mezőbe írsz, az a fejlécbe kerül. Ha üresen hagyod őket, a lapon üres sorok lesznek, amelyeket kézzel tölthetsz ki.',
        },
      ],
      cta: {
        title: 'Térképezd fel a fordulót a képernyőn',
        body: 'A {product} Folyamatábra eszközével diagramként rendezheted el az állításokat és a válaszokat, szerkesztheted és exportálhatod. Mellette az MI-eszközök bármelyik oldalra esetet és cáfolatot írnak.',
      },
    },

    '/tools/speech-time-calculator': {
      title: 'Mennyi ideig tart a beszédem? Beszédidő-kalkulátor',
      intro: 'Illeszd be a beszédedet, és megmutatja a szószámát, azt, hogy lassú, átlagos vagy gyors tempóban mennyi ideig tart elmondani, és hogy mely vitabeszéd-időkbe fér bele. Minden a böngésződben fut; a szöveg nem hagyja el az oldalt.',
      sections: [
        {
          heading: 'Hogyan számol a kalkulátor',
          paragraphs: [
            'Úgy számolja a szavakat, ahogy egy olvasó: a „Lincoln-Douglas”, az „1848-as” és a „2026” egy-egy szó, a felsorolásjelek és a gondolatjelek pedig nem számítanak szónak. Ezután elosztja egy beszédtempóval. A lassú percenként 110, az átlagos 130, a gyors 160 szó; a negyedik mezőben megadhatod a saját tempódat.',
            'Ezek a tempók tervezéshez szánt közelítések, nem kutatási adatok. Az izguló beszélők fordulóban gyakran gyorsabban beszélnek, mint gyakorláskor, és egy számokkal vagy nevekkel teli beszéd tovább tart, mint amit a szószáma sejtet.',
          ],
        },
        {
          heading: 'Írj célszámra',
          paragraphs: [
            'Könnyebb eleve célszámra írni, mint utólag húzni. A célszám egyszerű szorzás, perc szorozva tempóval: egy 7 perces BP-beszéd átlagos, 130-as tempóban 910 szó, egy 8 perces World Schools-beszéd 1040. A kalkulátor ugyanazokat a formátumadatokat használja, mint a [vitaidőmérő](/tools/debate-timer), így ha beillesztesz egy vázlatot, minden beszédidőnél látod, mennyi időd marad, vagy mennyivel lépted túl.',
          ],
        },
        {
          heading: 'Ha túl hosszú a beszéd',
          steps: [
            'Előbb a felvezetést húzd. A köszönetek, a tétel megismétlése és a „most rátérek arra, hogy” másodperceket visznek el, és semmit nem adnak hozzá.',
            'Vond össze a példákat. Egy jól kifejtett példa többet ér három felsoroltnál.',
            'A mérlegelést tartsd meg. Ha valaminek mennie kell, a leírást húzd, ne az összehasonlítást. A bírók azon döntenek, miért fontosabb az érved, ezért az a mondat marad.',
            'Mérd újra hangosan. Illeszd be az új vázlatot, aztán mondd el a [vitaidőmérőn](/tools/debate-timer). A becslés közel visz, de az igazat az előadás mondja meg.',
          ],
        },
        {
          heading: 'Tempógyakorlat',
          paragraphs: [
            'Fogj egy 400 szavas szöveget. Olvasd fel egyszer a természetes tempódban az időmérőn, aztán úgy, hogy pontosan három perc legyen, aztán két és fél percre. Aki szándékosan tud tempót váltani, az le tud lassítani a fontos mondatnál, és gyorsan tud haladni az összegzésben, és ez többet ér, mint bármelyik tempó önmagában.',
            'Ha a beszédet gyakorlófordulóban is kipróbálod, nyomtass a társaidnak [jegyzetlapot](/tools/debate-flow-sheet), hogy utána összevethessétek, mi jutott át belőle.',
          ],
        },
      ],
      faq: [
        {
          question: 'Elküldi valahová a kalkulátor a beszédemet?',
          answer: 'Nem. A szószámot és az időket a böngésződ számolja gépelés közben. A szöveget soha nem töltjük fel, nem tároljuk, és más nem látja; a lap bezárásakor eltűnik.',
        },
        {
          question: 'Mennyire pontosak az időadatok?',
          answer: 'Becslések. A percenkénti 110, 130 és 160 szó a lassú, az átlagos és a gyors előadás munkaközelítése, nem mért norma, a saját tempód pedig a szünetektől, a hangsúlyoktól és attól függ, mennyit rögtönzöl. Olvass fel egyszer egy bekezdést időre, és ahhoz állítsd be a saját tempót.',
        },
        {
          question: 'Hogyan mérhetem meg a saját beszédtempómat?',
          answer: 'Illessz be egy nagyjából 260 szavas szöveget, olvasd fel beszédtempóban, miközben fut a vitaidőmérő, és oszd el a szavak számát az eltelt percekkel. Ezt a számot add meg saját tempóként, és a kalkulátor minden beszédidőnél azt használja.',
        },
        {
          question: 'Miért mutat több formátumot?',
          answer: 'Hogy egyből lásd, belefér-e a vázlat abba az időbe, amelyre írod. Minden sor egy beszédhossz egy formátumban, például a 4 perces Public Forum nyitóbeszéd és cáfolat, a választott tempó szerint megmaradó idővel vagy a túllépéssel.',
        },
        {
          question: 'Ki kell töltenie egy megírt beszédnek a teljes időt?',
          answer: 'Ritkán. Hagyj helyet a fordulóban hozzáadott válaszoknak, a parlamenti formátumokban a közbekérdezéseknek, és annak, hogy lelassíts a kulcsmondatnál. Jól használható ökölszabály, hogy az előre megírt beszéd 10–20 százalékkal legyen rövidebb az időkeretnél.',
        },
      ],
      cta: {
        title: 'Gyakorold hangosan, vitapartnerrel',
        body: 'A {product} Vitapárbaj-fordulóiban elmondhatsz egy időre mért beszédet, megkapod rá egy MI-ellenfél válaszát, és a forduló végén értékelést is kapsz, így a vázlatodat valódi válaszokkal teszteled, nem csak az órával.',
      },
    },
  },
};
