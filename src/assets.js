// Assets do jogo configurados pelo painel admin: carrega a configuração do servidor, texturas e ícones.
// Sem configuração (ou servidor fora do ar) tudo fica no visual original: cores e emojis.
import * as THREE from 'three';
import { DEFAULT_ASSETS, sanitizeAssets, iconPath } from './shared/assetConfig.js';
import { applySettings } from './shared/settings.js';

export const packUrl = (p) => `/packs/${p}`;

const state = { cfg: structuredClone(DEFAULT_ASSETS), listeners: new Set() };
export const assetConfig = () => state.cfg;

/** chamado sempre que a configuração visual muda (painel admin salvou, prévia, etc.) */
export function onAssetsChange(fn) { state.listeners.add(fn); }

/** { assets?, settings? } vindos do servidor (/api/config ou mensagem {t:'config'}) ou da prévia do admin */
export function setConfig({ assets, settings } = {}) {
  if (settings) applySettings(settings);
  if (assets) {
    state.cfg = sanitizeAssets(assets);
    for (const fn of state.listeners) { try { fn(state.cfg); } catch (e) { console.error('[assets]', e); } }
  }
}

export async function fetchConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) return null;
    const data = await r.json();
    setConfig({ settings: data.settings }); // assets são aplicados depois que o mundo existe
    state.cfg = sanitizeAssets(data.assets);
    return data;
  } catch { return null; }
}

// ---------- Imagens e texturas ----------
const images = new Map();
export function loadImage(path) {
  if (!images.has(path)) {
    images.set(path, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(path); reject(new Error(`não carregou ${path}`)); };
      img.src = packUrl(path);
    }));
  }
  return images.get(path);
}

/** "detalhe": a textura vira tons de cinza em volta de DETAIL_MEAN e multiplica a cor original do objeto */
export const DETAIL_MEAN = 0.8;
function detailCanvas(img, forca) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 8) continue; sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; n++; }
  const mean = sum / Math.max(1, n) || 128;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = Math.max(0, Math.min(255, Math.round(255 * DETAIL_MEAN * (1 + (l / mean - 1) * forca))));
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

const textures = new Map();
/**
 * Textura repetível. opts: { detail, forca, filtro: 'pixel'|'suave', repeat } → THREE.Texture (cacheada)
 */
export async function loadTexture(path, { detail = false, forca = 1, filtro = 'pixel', repeat = 1, alpha = false } = {}) {
  const key = `${path}|${detail ? forca : 'o'}|${filtro}|${repeat}|${alpha}`;
  if (textures.has(key)) return textures.get(key);
  const img = await loadImage(path);
  const tex = detail ? new THREE.CanvasTexture(detailCanvas(img, forca)) : new THREE.Texture(img);
  tex.colorSpace = detail ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = alpha ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = filtro === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textures.set(key, tex);
  return tex;
}

// ---------- Ícones dos itens ----------
/** URL do ícone do item, ou null (usa o emoji) */
export function iconUrl(id) {
  const p = iconPath(state.cfg, id);
  return p ? packUrl(p) : null;
}

/** elemento com o ícone (imagem do pacote ou o emoji do item) */
export function iconNode(id, emoji = '', cls = 'ico') {
  const url = iconUrl(id);
  if (!url) { const s = document.createElement('span'); s.className = `${cls} emoji`; s.textContent = emoji; return s; }
  const img = document.createElement('img');
  img.className = cls; img.src = url; img.alt = emoji; img.draggable = false;
  img.onerror = () => { const s = document.createElement('span'); s.className = `${cls} emoji`; s.textContent = emoji; img.replaceWith(s); };
  return img;
}
