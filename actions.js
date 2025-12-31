export const DEFAULT_ACTIONS = [
    "Canta un villancito corto",
    "Haz 10 sentadillas",
    "Habla como robot",
    "Cuenta un chiste malo",
    "Di 3 cosas buenas del jugador que tengas mas cerca",
    "Haz una pose de reno 15 segundos",
    "Haz un brindis navideño",
    "Di 'Ho Ho Ho' después de cada frase",
    "Haz una mímica de película navideña el resto deben adivinar",
    "Di tu mejor consejo para el proximo año",
    "Baila una bachata navideña con la persona más cercana",
    "Describe tu regalo ideal",
    "Di 3 palabras prohibidas y evita decirlas",
    "Di el nombre de todos los jugadores rápido",
    "Cuenta algo vergonzoso (light)",
    "Haz un sonido de duende",
    "Reta a alguien a piedra-papel-tijera si pierdes haz 10 abdominales",
    "Di un trabalenguas",
    "Haz 10 segundos de beatbox",
    "Di 2 verdades y 1 mentira sobre ti el jugador más cercano debe adivinar la mentira si lo hace haces 5 burpees",
    "Di una palabra y que todos la repitan con eco",
    "Crea un saludo secreto con alguien",
    "Haz una rima con 'turrón'",
    "Haz una rima con 'navidad'",
    "Haz 10 abdominales (o equivalente)",
    "Di el último emoji que usaste",
    "Confiesa tu comida navideña favorita",
    "Inventa un villancico de 1 frase",
    "Da un aplauso dramático",
    "Haz una mirada intensa 20 segundos con el jugador mas cercano",
    "Di algo bonito a alguien al azar",
    "Pon cara de Grinch 10 segundos",
    "Haz una mini-historia con 3 palabras que te digan",
    "Habla sin usar la letra 'a'",
    "Haz un brindis por la amistad",
    "Di un dato random sobre ti",
    "Elige una palabra y todos deben decirla al final de su frase",
    "Cambia tu nombre por uno navideño",
    "Haz un sonido de campanitas",
    "Haz una reverencia exagerada",
    "Di 'feliz navidad' en otro idioma en Chino",
    "Haz una pregunta profunda a alguien",
    "Haz una mini-coreografía",
    "Habla en susurros durante 1 minuto cada vez que alguien diga “Navidad”",
    "Aplaude y ríete como loco después de cada broma",
    "Empieza cada frase con: “Dato curioso…”",
    "Llama a todos por un nombre equivocado",
    "Cada vez que alguien brinde, di “miau”",
    "Cada vez que bebas, haz un sonido de reno",
    "Defiende algo absurdo decidido por el grupo",
    "Si alguien dice tu nombre, aplaude",
    "Reacciona a todo como si fuera dramático",
    "Pide permiso antes de sentarte",
    "Di “HO HO HO” cada vez que alguien se ría",
    "Haz de elfo enfadado",
    "Levanta el pulgar y di “bien hecho” cada vez que alguien beba",
    "Suspira dramáticamente antes de hablar",
    "Cada vez que alguien diga tu nombre, di “¿sí, jefe?”",
    "Habla como presentador de televisión",
    "Aplaude cada vez que alguien se levante de la silla",
    "Haz de abogado del diablo",
    "Canta una palabra de una canción random cada vez que bebas",
    "Cambia de personalidad cada 3 minutos",
    "Reacciona como villano de película",
    "Emociónate exageradamente con cualquier decoración",
    "Actúa como si Papá Noel te estuviera observando",
    "Ríete dos segundos tarde",
    "Copia la última palabra que alguien diga",
    "Traduce cualquier frase a un idioma inventado",
    "Mantén contacto visual incómodo durante 20 segundos",
    "Haz un brindis improvisado",
    "Confiesa algo falso pero muy convincente",
    "Habla como si estuvieras narrando un documental",
    "Reacciona a todo con un ¡increíble!",
    "Termina todas tus frases con '…y eso es Navidad'",
    "Habla como si tuvieras frío extremo",
    "Actúa como si todo fuera tu culpa",
    "Celebra cualquier cosa con aplausos exagerados",
    "Habla como si fueras un personaje de cuento",
    "Haz comentarios como si esto fuera una final deportiva",
    "Pide un aplauso para ti mismo",
];

export function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function makeRoomCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}
