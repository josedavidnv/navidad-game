// 50 acciones base (puedes editar lo que quieras)
export const DEFAULT_ACTIONS = [
    "Canta un villancico 10 segundos",
    "Haz 5 sentadillas",
    "Imita a Papá Noel",
    "Habla como robot durante 1 minuto",
    "Cuenta un chiste malo",
    "Di 3 cosas buenas del jugador de tu derecha",
    "Haz una pose de reno 15 segundos",
    "Bebe un sorbo de agua",
    "Haz un brindis navideño",
    "Di ‘Ho Ho Ho’ 5 veces",
    "Haz una mímica de película navideña",
    "Di tu mejor consejo para 2026",
    "Haz 10 palmadas rítmicas",
    "Baila 15 segundos",
    "Describe tu regalo ideal",
    "Di 3 palabras prohibidas y evita decirlas (1 ronda)",
    "Di el nombre de todos los jugadores rápido",
    "Cuenta algo vergonzoso (light)",
    "Haz un sonido de duende",
    "Reta a alguien a piedra-papel-tijera",
    "Di un trabalenguas",
    "Haz 10 segundos de beatbox",
    "Di 2 verdades y 1 mentira (rápido)",
    "Imita a un jugador (sin decir quién) 20 segundos",
    "Haz un discurso de ‘Rey/Reina de la Navidad’",
    "Di una palabra y que todos la repitan con eco",
    "Crea un saludo secreto con alguien",
    "Haz una rima con ‘turrón’",
    "Haz una rima con ‘navidad’",
    "Haz 3 abdominales (o equivalente)",
    "Di el último emoji que usaste",
    "Confiesa tu comida navideña favorita",
    "Inventa un villancico de 1 frase",
    "Da un aplauso dramático",
    "Haz una mirada intensa 10 segundos",
    "Di algo bonito a alguien al azar",
    "Pon cara de Grinch 10 segundos",
    "Haz una mini-historia con 3 palabras que te digan",
    "Habla sin usar la letra ‘a’ 30 segundos",
    "Haz un brindis por la amistad",
    "Di un dato random sobre ti",
    "Haz una imitación de presentador de TV",
    "Elige una palabra y todos deben decirla al final de su frase (1 ronda)",
    "Cambia tu nombre por uno navideño (1 ronda)",
    "Haz un sonido de campanitas",
    "Haz una reverencia exagerada",
    "Di ‘feliz navidad’ en otro idioma",
    "Haz una pregunta profunda a alguien",
    "Haz una mini-coreografía con manos 10 segundos",
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
