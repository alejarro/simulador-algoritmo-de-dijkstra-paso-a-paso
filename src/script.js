// --- Estado Global ---
let n = 8;
let mode = 'random';
let edges = [];
let pos = [];
let layer = [];
let src = null, dst = null;
let steps = [];
let si = 0;
let timer = null;
let currentScreen = 1;
const W = 800, H = 500, R = 18;
const $ = id => document.getElementById(id);
const L = i => String.fromCharCode(65 + i);
let selPath = -1; // -1 muestra todos los caminos, >= 0 resalta un camino específico

// --- Navegación del Wizard ---
function goToScreen(step) {
  currentScreen = step;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen${step}`);
  if (target) target.classList.add('active');
  const graphCard = document.getElementById('graphCard');
  if (!graphCard) return;
  if (step === 1) {
    graphCard.style.display = 'none'; // Oculta el grafo en la pantalla 1
  } else if (step === 2) {
    graphCard.style.display = 'block'; // Muestra el grafo
    document.getElementById('screen2GraphSlot').appendChild(graphCard);
  } else if (step === 3) {
    graphCard.style.display = 'block'; // Muestra el grafo
    document.getElementById('screen3GraphSlot').appendChild(graphCard);
  } 
  render();
}

function setMsg(id, txt) {
  $(id).textContent = txt;
}
// --- Distribución Circular de los Nodos ---
function layoutGraph() {
  layer = Array(n).fill(0);
  pos = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + 2 * Math.PI * i / n;
    return {
      x: W / 2 + Math.cos(a) * 300,
      y: H / 2 + Math.sin(a) * 170
    };
  });
}

// --- Generación Aleatoria DAG (Max 3, Min 2 Entradas/Salidas) ---
function randomGraph() {
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];}
  const seen = new Set();
  const inDegree = Array(n).fill(0);
  const outDegree = Array(n).fill(0);
  const add = (a, b) => {
    if (a >= b) return false;
    const k = a + ',' + b;
    if (seen.has(k)) return false;
    if (inDegree[b] >= 3) return false;
    if (outDegree[a] >= 3) return false;
    seen.add(k);
    inDegree[b]++;
    outDegree[a]++;
    edges.push({
      u: order[a],
      v: order[b],
      w: 1 + Math.floor(Math.random() * 9)
    });
    return true;
  };

  // Cadena base obligatoria (asegura conexión total sin nodos atrapados)
  for (let i = 0; i < n - 1; i++) {
    add(i, i + 1);
  }
  // Garantizar out-degree >= 2 donde sea posible
  for (let i = 0; i <= n - 3; i++) {
    let candidates = [];
    for (let j = i + 1; j < n; j++) candidates.push(j);
    for (let k = candidates.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
    }
    for (const t of candidates) {
      if (outDegree[i] >= 2) break;
      add(i, t);
    }
  }

  // Garantizar in-degree >= 2 donde sea posible
  for (let j = 2; j < n; j++) {
    let candidates = [];
    for (let i = 0; i < j; i++) candidates.push(i);
    for (let k = candidates.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
    }
    for (const t of candidates) {
      if (inDegree[j] >= 2) break;
      add(t, j);}}
  // Conexiones aleatorias extras
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n; j++) {
      if (Math.random() < 0.25) add(i, j);
    }}}

// --- Inicialización del Grafo (Pantalla 1 -> Pantalla 2) ---
function createGraph() {
  const v = Number($('n').value);
  if (!Number.isInteger(v) || v < 7 || v > 16) {
    return setMsg('cfgMsg', 'Ingresa un número entero entre 7 y 16.');
  }
  setMsg('cfgMsg', '');
  n = v;
  mode = document.querySelector('input[name=mode]:checked').value;
  edges = [];
  layoutGraph();
  if (mode === 'random') {
    randomGraph();}
  const opts = Array.from({ length: n }, (_, i) => `<option value="${i}">${L(i)}</option>`).join('');
  const placeholder = '<option value="" disabled selected>--</option>';
  $('eu').innerHTML = opts;
  $('ev').innerHTML = opts;
  $('src').innerHTML = placeholder + opts;
  $('dst').innerHTML = placeholder + opts;
  $('ev').value = 1;
  $('manualCard').hidden = mode !== 'manual';
  graphChanged();
  goToScreen(2);
}

function graphChanged() {
  stopPlay();
  steps = [];
  si = 0;
  src = null;
  dst = null;
  selPath=-1;
  $('tableCard').innerHTML = '';
  $('logCard').innerHTML = '';

  // Reinicia la tarjeta de resultados, si existe en el HTML.
  if ($('resultDistance')) $('resultDistance').textContent = '—';

  // Reinicia la cantidad de caminos mínimos.
  if ($('resultCount')) $('resultCount').textContent = '—';

  // Reinicia el texto que muestra la ruta.
  if ($('resultPaths')) {
    $('resultPaths').textContent = 'El camino mínimo aparecerá aquí.';
  }
  render();
}


// Verifica si existe algún camino desde 'start' hasta 'target'
function hasPath(start, target) {
  const visited = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr === target) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      // Obtiene los vecinos salientes de 'curr'
      const neighbors = edges.filter(e => e.u === curr).map(e => e.v);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
  }
  return false;
}

// --- Edición Manual de Aristas ---
function addEdge() {
  const u = +$('eu').value;
  const v = +$('ev').value;
  const w = +$('ew').value;
  if (u === v) return setMsg('edgeMsg', 'No se permiten bucles (mismo origen y destino).');
  if (!Number.isInteger(w) || w < 1 || w > 20) return setMsg('edgeMsg', 'El peso debe ser entre 1 y 20.');
  if (edges.some(e => e.u === u && e.v === v)) return setMsg('edgeMsg', 'Esa arista ya existe.');
  // Validación de ciclo: si ya se puede ir de V a U, agregar U -> V crea un ciclo
  if (hasPath(v, u)) {
    return setMsg('edgeMsg', `No se puede agregar (${L(u)} → ${L(v)}) porque generaría un ciclo en el grafo.`);}
  setMsg('edgeMsg', '');
  edges.push({ u, v, w });
  graphChanged();
}

function clearEdges() {
  edges = [];
  setMsg('edgeMsg', '');
  graphChanged();
}

// --- Realiza una búsqueda recursiva desde el destino t hasta el origen s 
// --- explorando el arreglo preds del camino minimo last
function enumeratePaths(stepData, s, t) {
  if (!stepData || stepData.dist[t] === Infinity) return [];
  const out = [];
  (function walk(v, acc) {
    acc = [v, ...acc];
    if (v === s) {
      out.push(acc);
      return;
    }
    const parents = stepData.prev[v];
    if (Array.isArray(parents)) {
      parents.forEach(p => walk(p, acc));
    }
  })(t, []);
  return out.sort((a, b) => a.join().localeCompare(b.join()));
}


// --- Algoritmo de Dijkstra (Pantalla 2 -> Pantalla 3) ---
function runDijkstra() {
  if ($('src').value === "" || $('dst').value === "") {
    return setMsg('runMsg', 'Debes seleccionar un origen y un destino.');
  }
  src = +$('src').value;
  dst = +$('dst').value;
  if (src === dst) return setMsg('runMsg', 'El origen y el destino deben ser distintos.');
  if (!edges.length) return setMsg('runMsg', 'Agrega al menos una arista antes de ejecutar.');
  setMsg('runMsg', '');
  buildSteps();
  si = 0;
  goToScreen(3);
  update();
}


function buildSteps() {
  steps = [];
  const dist = Array(n).fill(Infinity);
  const cnt = Array(n).fill(0);
  const prev = Array.from({ length: n }, () => []);
  const visited = Array(n).fill(false); // CORREGIDO: Arreglo de booleanos
  const history = [];
  const discardedLabels = Array.from({ length: n }, () => []);
  
  dist[src] = 0;
  cnt[src] = 1;
  const recordTable = () => history.map(h => ({ ...h }));
  history.push({ iter: 0, u: src, labels: Array.from({ length: n }, (_, i) => i === src ? { d: 0, p: null, discarded: false } : null) });
  steps.push({
    visited: [...visited],
    dist: [...dist],
    prev: [...prev],
    curr: src,
    examEdge: null,
    minPath: [],
    desc: `Inicio: el origen <b>${L(src)}</b> recibe la etiqueta [0, -]<sub>(0)</sub>.`,
    table: recordTable()});

  let iter = 1;
  while (true) {
    let u = -1, minD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < minD) {
        minD = dist[i];
        u = i; }}
    if (u === -1 || minD === Infinity) {
      steps.push({
        visited: [...visited],
        dist: [...dist],
        prev: [...prev],curr: null,examEdge: null,minPath: [],
        desc: `No existen más caminos alcanzables hacia el destino <b>${L(dst)}</b>.`,
        table: recordTable()
      });
      break;
    }

    visited[u] = true;
    steps.push({
      visited: [...visited],
      dist: [...dist],
      prev: [...prev],curr: u,examEdge: null,minPath: [],
      desc: `Iteración ${iter}: Se selecciona el nodo <b>${L(u)}</b> con menor acumulado (${dist[u]}).`,
      table: recordTable()
    });

    if (u === dst) break;
    const outEdges = edges.filter(e => e.u === u);
    const currentLabels = Array(n).fill(null);
    for (const e of outEdges) {
      const v = e.v;
      if (visited[v]) continue;
      const alt = dist[u] + e.w;
      const examEdge = { u: e.u, v: e.v };
      
      if (alt < dist[v]) {
      dist[v] = alt;
      prev[v] = [u];
      cnt[v] = cnt[u];
      currentLabels[v] = { d: alt, p: [u], discarded: false };
      steps.push({
      visited: [...visited], dist: [...dist], prev: prev.map(p => [...p]), curr: u, examEdge,
      desc: `Se examina (${L(u)}→${L(v)}, peso ${e.w}). Se mejora distancia a <b>${L(v)}</b>: ${alt}.`,
      table: recordTable()
      });
      } else if (alt === dist[v]) {
      prev[v].push(u);
      cnt[v] += cnt[u];
      currentLabels[v] = { d: alt, p: [...prev[v]], discarded: false };
      steps.push({
      visited: [...visited], dist: [...dist], prev: prev.map(p => [...p]), curr: u, examEdge,
      desc: `Se examina (${L(u)}→${L(v)}, peso ${e.w}). Empate (${alt}): se registra camino alternativo por <b>${L(u)}</b>.`,
      table: recordTable()
      });

      } else {
        currentLabels[v] = { d: alt, p: [u], discarded: true };
        discardedLabels[v].push({
        d: alt,       
        p: u,         
        iter: iter    
    });
    steps.push({
      visited: [...visited],
      dist: [...dist],
      prev: prev.map(p => [...p]),
      curr: u,
      examEdge,
      // Guardar una copia del historial de etiquetas descartadas.
      discardedLabels: discardedLabels.map(labels =>
        labels.map(label => ({ ...label }))
      ),
      desc: `Se examina (${L(u)}→${L(v)}, peso ${e.w}). ${alt} ≥ ${dist[v]}, etiqueta descartada.`,
      table: recordTable()
      });
      }
    }
    history.push({ iter, u, labels: currentLabels });
    iter++;
  }
}

// --- Controles de Reproducción ---
function go(i) {
  if (i < 0 || i >= steps.length) return;
  si = i;
  update();}

function stopPlay() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $('bPlay').textContent = '▶ Auto';}}

function togglePlay() {
  if (timer) {
    stopPlay();
  } else {
    if (si >= steps.length - 1) si = 0;
    $('bPlay').textContent = '⏸ Pausa';
    timer = setInterval(() => {
      if (si < steps.length - 1) {
        si++;
        update();
      } else {
        stopPlay();}
    }, 1200);}}

// actualizacion trajeta de resultados
function updateResultPanel(s) {
  if (!$('resultDistance') || !$('resultCount') || !$('resultPaths')) return;

  const finished = si === steps.length - 1;
  if (!finished) {
    $('resultDistance').textContent = 'En cálculo';
    $('resultCount').textContent = 'En cálculo';
    $('resultPaths').innerHTML = '<p>La ruta mínima aparecerá cuando termine la ejecución.</p>';
    return;
  }

  if (s.dist[dst] === Infinity) {
    $('resultDistance').textContent = 'No existe ruta';
    $('resultCount').textContent = '0';
    $('resultPaths').innerHTML = `<p>No existe un camino desde ${L(src)} hasta ${L(dst)}.</p>`;
    return;
  }

  // Obtener todos los caminos usando el último paso
  const allPaths = enumeratePaths(steps[steps.length - 1], src, dst);

  // Actualizar distancia y cantidad
  $('resultDistance').textContent = s.dist[dst];
  $('resultCount').textContent = allPaths.length;

  // Renderizar la lista de caminos encontrados
  let pathsHTML = allPaths.map((path, idx) => `
    <div class="result-path-item" style="margin-bottom:6px;">
      <button class="btn btn-secondary path-btn ${selPath === idx ? 'active' : ''}" data-idx="${idx}" style="width:100%; text-align:left;">
        <b>Camino ${idx + 1}:</b> ${path.map(L).join(' → ')}
      </button>
    </div>
  `).join('');

  if (allPaths.length > 1) {
    pathsHTML += `
      <button class="btn btn-primary path-btn ${selPath === -1 ? 'active' : ''}" data-idx="-1" style="width:100%; margin-top:4px;">
        Ver todos los caminos a la vez
      </button>
    `;
  }
  $('resultPaths').innerHTML = pathsHTML;
  // Eventos de clic para resaltar un camino específico en el SVG
  $('resultPaths').querySelectorAll('.path-btn').forEach(btn => {
    btn.onclick = () => {
      selPath = +btn.dataset.idx;
      update();
    };
  });
}

function update() {
  if (!steps.length) return;
  const s = steps[si];
  $('bPrev').disabled = si === 0;
  $('bNext').disabled = si === steps.length - 1;
  // Muestra todas las decisiones desde el inicio hasta el paso actual.
  $('logCard').innerHTML = steps.slice(0, si + 1).map((step, index) => {
  // Crea una tarjeta para cada decisión registrada.
  return `<div class="log-box ${index === si ? 'log-current' : ''}">
      <!-- Número de orden de la decisión. -->
      <strong class="log-number">${index + 1}.</strong>
      <!-- Explicación correspondiente a este paso. -->
      <span>${step.desc}</span></div>`;}).join('');
// Desplaza automáticamente el panel hasta la última decisión.
$('logCard').scrollTop = $('logCard').scrollHeight;
  // Renderizar Tabla de Etiquetas
  let html = `<table class="labels-table"><thead><tr><th>Vértice</th>`;
const iters = s.table;
let finalLabelColumn = -1;
if (s.visited[dst] && s.dist[dst] !== Infinity) {
  iters.forEach((it, index) => {
    const lbl = it.labels[dst];
    if (lbl && !lbl.discarded && lbl.d === s.dist[dst]) {
      finalLabelColumn = index;
    }
  });
}
// Crear los encabezados de las iteraciones.
iters.forEach(it => {
  html += `<th>Iter. ${it.iter}</th>`;
});
html += `</tr></thead><tbody>`;
for (let i = 0; i < n; i++) {
  html += `<tr><td><b>${L(i)}</b></td>`;
  iters.forEach((it, index) => {
    const lbl = it.labels[i];
    if (!lbl) {
      html += `<td></td>`;
    } else {
      const cls = [];
      if (it.iter > 0 && !lbl.discarded) {
        cls.push('cell-accumulated');
      }
      if (i === dst && index === finalLabelColumn) {
        cls.push('cell-final');
      }
      if (lbl.discarded) {
        cls.push('cell-discarded');
      }
      const parents = Array.isArray(lbl.p) && lbl.p.length > 0
        ? lbl.p.map(L).join(' / ')
        : '-';
      const txt = `${lbl.d}, ${parents}`;
      html += `<td class="${cls.join(' ')}">${txt}</td>`;
    }
  });
  // Cerrar la fila del vértice.
  html += `</tr>`;
}

// Cerrar la tabla.
html += `</tbody></table>`;
  $('tableCard').innerHTML = html;
  // Actualiza la tarjeta de resultados con los datos del paso actual.
  updateResultPanel(s);
  render();
}

function geom(e) {
  const p1 = pos[e.u], p2 = pos[e.v];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Vector normal perpendicular a la recta
  const nx = -dy / len;
  const ny = dx / len;
  let maxObstacle = null;
  let minDist = Infinity;
  // Detectar si algún otro nodo 'k' se cruza en la trayectoria entre 'u' y 'v'
  for (let k = 0; k < n; k++) {
    if (k === e.u || k === e.v) continue;
    const pk = pos[k];
    // Proyección del punto sobre el segmento
    const t = ((pk.x - p1.x) * dx + (pk.y - p1.y) * dy) / (len * len);
    // Solo evaluar nodos que estén físicamente entre el origen y el destino
    if (t > 0.15 && t < 0.85) {
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.hypot(pk.x - projX, pk.y - projY);
      // Si el nodo está a menos de 45px de la línea recta (radio del nodo 18px + margen)
      if (dist < 45 && dist < minDist) {
        minDist = dist;
        maxObstacle = { pk, projX, projY };
    }}}
  // 1. Si NO hay ningún nodo estorbando: la arista es una LÍNEA RECTA
  if (!maxObstacle) {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    return {
      d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
      lab: { x: mx, y: my }};}
  // 2. Si HAY un nodo intermedio: se curva en la dirección que lo esquiva
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const offset = 55; // Magnitud de la curva
  const cand1X = midX + nx * offset, cand1Y = midY + ny * offset;
  const cand2X = midX - nx * offset, cand2Y = midY - ny * offset;
  const d1 = Math.hypot(cand1X - maxObstacle.pk.x, cand1Y - maxObstacle.pk.y);
  const d2 = Math.hypot(cand2X - maxObstacle.pk.x, cand2Y - maxObstacle.pk.y);
  // Elegir el punto de control que quede más lejos del nodo obstáculo
  const cx = d1 > d2 ? cand1X : cand2X;
  const cy = d1 > d2 ? cand1Y : cand2Y;
  const lx = (p1.x + 2 * cx + p2.x) / 4;
  const ly = (p1.y + 2 * cy + p2.y) / 4;
  return {
    d: `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`,
    lab: { x: lx, y: ly }
  };
}
// --- Renderizado SVG y Drag & Drop ---
function render() {
  const svg = $('svg');
  if (!svg || !pos.length) return;
  const st = steps[si] || null;

  const discardedState = steps
  .slice(0, si + 1)
  .reverse()
  .find(step => step.discardedLabels);

  // Si todavía no existen etiquetas descartadas, utilizar listas vacías.
  const discardedHistory = discardedState
  ? discardedState.discardedLabels
  : Array.from({ length: n }, () => []);

  let html = `<defs>
    <marker id="arrow"
      viewBox="0 0 10 10"
      refX="20" refY="5"
      markerWidth="6" markerHeight="6"
      orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/>
    </marker>
    <marker id="arrow-exam"
      viewBox="0 0 10 10"
      refX="20" refY="5"
      markerWidth="6" markerHeight="6"
      orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316"/>
    </marker>
    <marker id="arrow-known"
      viewBox="0 0 10 10"
      refX="20" refY="5"
      markerWidth="6" markerHeight="6"
      orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6"/>
    </marker>
    <marker id="arrow-min"
      viewBox="0 0 10 10"
      refX="20" refY="5"
      markerWidth="6" markerHeight="6"
      orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#22C55E"/>
    </marker>
  </defs>`;

  //Cambios en Renderizado
  const finalPaths = (steps.length > 0) ? enumeratePaths(steps[steps.length - 1], src, dst) : [];
  const activePaths = (selPath >= 0 && selPath < finalPaths.length) ? [finalPaths[selPath]] : finalPaths;


  // Renderizar Aristas (cambiado)
  edges.forEach(e => {
    let stroke = '#94a3b8', width = 2, marker = 'url(#arrow)';
    if (st) {
      if (st.examEdge && st.examEdge.u === e.u && st.examEdge.v === e.v) {
        stroke = '#f97316'; width = 3.5; marker = 'url(#arrow-exam)';
      } else if (si === steps.length - 1 && activePaths.length > 0) {
        const isMinEdge = activePaths.some(path => {
          for (let k = 0; k < path.length - 1; k++) {
            if (path[k] === e.u && path[k + 1] === e.v) return true;
          }
          return false;
        });
        if (isMinEdge) {
          stroke = '#22C55E'; width = 4; marker = 'url(#arrow-min)';
        }
      } else if (st.prev[e.v] && st.prev[e.v].includes(e.u)) {
        stroke = '#3b82f6'; width = 3; marker = 'url(#arrow-known)';
      }
    }
    const g = geom(e);
    html += `<path d="${g.d}" fill="none" stroke="${stroke}" stroke-width="${width}" marker-end="${marker}"/>`;
    html += `<rect x="${g.lab.x - 10}" y="${g.lab.y - 9}" width="20" height="18" rx="5" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>`;
    html += `<text x="${g.lab.x}" y="${g.lab.y + 4.5}" text-anchor="middle" font-size="11" font-weight="bold" fill="#334155">${e.w}</text>`;
  });

 
  // Renderizar Nodos
  for (let i = 0; i < n; i++) {
    const p = pos[i];
    let fill = '#3B82F6';
    if (st && st.visited[i]) {
      fill = '#22C55E';
    }
    if (st && st.curr === i) {
      fill = '#8B5CF6';
    }

    let labelExtra = '';

    if (st && st.dist[i] !== Infinity) {
    const parents = Array.isArray(st.prev[i]) && st.prev[i].length > 0
        ? st.prev[i].map(L).join('/')
        : '-';
      labelExtra = `<text x="${p.x}" y="${p.y - R - 8}" text-anchor="middle" font-size="11" font-weight="bold" fill="#991b1b">[${st.dist[i]}, ${parents}]</text>`;
    }

    let discardedExtra = '';
    const rejected = discardedHistory[i] || [];
    rejected.forEach((label, index) => {
    const parent = L(label.p);
    const y = p.y - R - 22 - (index * 13);
    discardedExtra += `
    <text
      x="${p.x}"
      y="${y}"
      text-anchor="middle"
      font-size="10"
      font-weight="bold"
      fill="#94A3B8"
      style="text-decoration: line-through;">
      [${label.d}, ${parent}] (${label.iter})
    </text>
    `;
  });
    
    let nodeTag = '';
    if (i === src) {
      nodeTag = `<text x="${p.x}" y="${p.y + R + 14}" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">origen</text>`;
    }
    if (i === dst) {
      nodeTag = `<text x="${p.x}" y="${p.y + R + 14}" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">destino</text>`;
    }
    html += discardedExtra;
    html += labelExtra;
    html += `<circle cx="${p.x}" cy="${p.y}" r="${R}" fill="${fill}" stroke="#1E40AF" stroke-width="2" class="node" data-id="${i}" style="cursor:grab;"/>`;
    html += `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="13" font-weight="bold" fill="#ffffff" pointer-events="none">${L(i)}</text>`;
    html += nodeTag;
  }
  svg.innerHTML = html;
  attachDragEvents();

}
// --- Eventos Arrastrar/Soltar (Drag & Drop) ---
let dragId = null;
function attachDragEvents() {
  const svg = $('svg');
  if (svg.dataset.dragEventsAttached === 'true') return;
  svg.dataset.dragEventsAttached = 'true';

  // MODIFICACIÓN: pointerdown funciona tanto al presionar con mouse como al tocar con el dedo.
  svg.addEventListener('pointerdown', e => {
    const node = e.target.closest('.node');

    if (!node) return;

    dragId = Number(node.dataset.id);

    // MODIFICACIÓN: mantiene capturado el movimiento aunque el dedo salga del nodo.
    svg.setPointerCapture(e.pointerId);

      e.preventDefault();
  });

  // MODIFICACIÓN: pointermove reemplaza mousemove y permite mover nodos en celulares.
  svg.addEventListener('pointermove', e => {
    if (dragId === null) return;

    const rect = svg.getBoundingClientRect();

    // Convierte la posición del dedo o mouse a las coordenadas internas del SVG.
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);

    // Evita que el nodo pueda salir de los límites del grafo.
    pos[dragId].x = Math.max(R, Math.min(W - R, x));
    pos[dragId].y = Math.max(R, Math.min(H - R, y));

    render();
    e.preventDefault();
  });

  // MODIFICACIÓN: finaliza el movimiento al levantar el dedo o soltar el mouse.
  const stopDragging = () => {
    dragId = null;
  };

  svg.addEventListener('pointerup', stopDragging);
  svg.addEventListener('pointercancel', stopDragging);
  svg.addEventListener('lostpointercapture', stopDragging);
}

// --- Asignación de Eventos Iniciales ---
window.onload = () => {
  $('btnCreate').onclick = createGraph;
  $('btnAddEdge').onclick = addEdge;
  $('btnClearEdges').onclick = clearEdges;
  $('btnRun').onclick = runDijkstra;
  $('btnBackTo1').onclick = () => goToScreen(1);
  $('btnBackTo2').onclick = () => goToScreen(2);
  $('bPrev').onclick = () => { stopPlay(); go(si - 1); };
  $('bNext').onclick = () => { stopPlay(); go(si + 1); };
  $('bPlay').onclick = togglePlay;
  
  // Atajos de Teclado (Pantalla 3)
  window.onkeydown = e => {
    if (currentScreen !== 3) return;
    if (e.key === 'ArrowLeft') { stopPlay(); go(si - 1); }
    if (e.key === 'ArrowRight') { stopPlay(); go(si + 1); }
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  }; goToScreen(1);


};