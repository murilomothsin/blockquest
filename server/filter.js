// Filtro de palavrões do chat (servidor). Troca a palavra por asteriscos, mantendo o resto da frase.
// Pega variações comuns: acentos (cú), maiúsculas, letras repetidas (porraaa),
// números no lugar de letras (p0rr4) e separadores (p.o.r.r.a / p o r r a).
// Para ampliar a lista basta acrescentar raízes abaixo (sem acento, minúsculas).

// raízes: casam no começo da palavra (caralho, caralhada…)
const ROOTS = [
  'porra', 'caralh', 'krl', 'fdp', 'filhadaput', 'filhodaput', 'puta', 'puto', 'putinh', 'putaria',
  'merda', 'bost', 'cuzao', 'cuzinh', 'arrombad', 'buceta', 'boceta', 'xoxota', 'piroca', 'pica',
  'cacete', 'foder', 'fode', 'fodid', 'fudid', 'fuder', 'foda', 'fudeu', 'fodeu', 'vsf', 'vtnc', 'tnc',
  'otari', 'babac', 'escrot', 'desgraçad', 'desgracad', 'vagabund', 'vadia', 'piranha', 'corno',
  'viado', 'veado', 'bicha', 'traveco', 'sapatao', 'macaco', 'retardad', 'mongol', 'punheta', 'siririca',
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'whore', 'slut', 'dick', 'pussy', 'asshole',
];
// só casam a palavra inteira (curtas demais para raiz: evitam bloquear "cuidado", "picanha", "cume"…)
const EXACT = ['cu', 'cus', 'pau', 'rola', 'pinto', 'bunda', 'ku', 'pqp', 'cuzin', 'tmnc', 'vtmnc', 'pnc', 'gay'];
// palavras normais que começam com uma raiz (não censurar)
const ALLOW = ['picanha', 'picape', 'picada', 'picadinho', 'picole', 'picolé', 'picar', 'pica-pau', 'bostik', 'macacao', 'macacão', 'pical', 'computador', 'disputa', 'reputa', 'imputa', 'dickens', 'bichano', 'bichinho', 'bicho'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

/** forma comparável: sem acento, minúscula, leet → letras, letras repetidas → uma */
function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c])
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}
const nRoots = ROOTS.map(norm);
const nExact = new Set(EXACT.map(norm));
const nAllow = ALLOW.map(norm);

function isBad(word) {
  const w = norm(word);
  if (!w) return false;
  if (nExact.has(w)) return true;
  if (nAllow.some((a) => w.startsWith(a))) return false;
  return nRoots.some((r) => w.startsWith(r));
}

const stars = (s) => s.replace(/[^\s]/g, '*');

/**
 * Retorna { text, hits } — text com os palavrões mascarados.
 * Além das palavras normais, junta letras soltas separadas por espaço/ponto ("p o r r a", "p.o.r.r.a").
 */
export function filterText(text) {
  let hits = 0;
  // 1) sequências de letras soltas: "p o r r a", "p.o.r.r.a", "p-o-r-r-a"
  let out = text.replace(/\b(?:[\p{L}\d@$][\s.\-_*]){2,}[\p{L}\d@$]\b/gu, (m) => (isBad(m) ? (hits++, stars(m)) : m));
  // 2) palavra a palavra (inclui números/símbolos dentro da palavra: p0rr4, put@).
  //    Palavras com hífen: se a palavra inteira é permitida (pica-pau), mantém; senão checa cada parte.
  out = out.replace(/[\p{L}\d@$!]+(?:-[\p{L}\d@$!]+)*/gu, (m) => {
    if (m.includes('-') && nAllow.includes(norm(m))) return m;
    return m.replace(/[\p{L}\d@$!]+/gu, (p) => {
      if (/^\d+$/.test(p)) return p;
      return isBad(p) ? (hits++, stars(p)) : p;
    });
  });
  return { text: out, hits };
}

/** Nome de usuário não pode conter palavrão (checagem mais rígida: em qualquer parte do nome). */
export function badName(name) {
  let n = norm(name);
  for (const a of nAllow) n = n.split(a).join('_'); // "Computador" contém "puta", mas é permitido
  return n.split('_').some((part) => nRoots.some((r) => r.length >= 4 && part.includes(r))) || nExact.has(n);
}
