import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, onSnapshot, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEvubBsurEQrK-xgKhx5X74n_qJWHMdB0",
  authDomain: "feria-ropa-d5cf7.firebaseapp.com",
  projectId: "feria-ropa-d5cf7",
  storageBucket: "feria-ropa-d5cf7.firebasestorage.app",
  messagingSenderId: "794936729041",
  appId: "1:794936729041:web:bf274e0ff7aeeaa9d314f0",
};

const C = {
  bg:       "#FBF7F2",
  surface:  "#FFFFFF",
  border:   "#E8E0D5",
  ink:      "#2C2416",
  inkLight: "#7A6E62",
  accent:   "#C9B89A",
  success:  "#5A9E72",
  danger:   "#C0392B",
  tag:      "#F0EAE1",
  admin:    "#5A4A9A",
};

const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString("es-AR")}` : "—";

function colorFor(nombre, usuarios) {
  if (!usuarios) return C.ink;
  const u = usuarios.find(u => u.nombre === nombre);
  return u?.color || C.ink;
}

function calcularDescuento(cant, tabla) {
  const sorted = [...tabla].sort((a, b) => b.cantidad - a.cantidad);
  for (const row of sorted) {
    if (cant >= row.cantidad) return row.porcentaje;
  }
  return 0;
}

function prorratear(items, precioFinal) {
  const total = items.reduce((s, i) => s + i.precio, 0);
  if (total === 0) return items.map(i => ({ ...i, precioFinal: 0 }));
  return items.map(i => ({ ...i, precioFinal: Math.round((i.precio / total) * precioFinal) }));
}

// ── QR Scanner ──────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!document.getElementById("jsqr-script")) {
      const s = document.createElement("script");
      s.id = "jsqr-script";
      s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      document.head.appendChild(s);
    }
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current && active) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      } catch (e) { console.error("Camera error", e); }
    };
    const tick = () => {
      if (!active) return;
      const video = videoRef.current; const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code) { onScan(code.data); return; }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    const script = document.getElementById("jsqr-script");
    script.onload = () => { if (active) animRef.current = requestAnimationFrame(tick); };
    if (window.jsQR) animRef.current = requestAnimationFrame(tick);
    startCamera();
    return () => { active = false; cancelAnimationFrame(animRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [onScan]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <video ref={videoRef} style={{ width: "100%", maxWidth: 480 }} playsInline muted />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 220, height: 220, border: `3px solid #D4845A`, borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
      <button onClick={onClose} style={{ position: "absolute", top: 24, right: 24, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 28, width: 44, height: 44, borderRadius: "50%", cursor: "pointer" }}>✕</button>
      <p style={{ color: "#fff", marginTop: 24, fontSize: 14 }}>Apuntá la cámara al QR de la etiqueta</p>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}`, ...style }}>{children}</div>;
}
function Btn({ children, onClick, style, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: "12px 20px", background: disabled ? C.accent : C.ink, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, ...style }}>{children}</button>;
}
function Row({ label, value, muted, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 14, color: muted ? C.inkLight : color || C.ink }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 400, color: muted ? C.inkLight : color || C.ink }}>{value}</span>
    </div>
  );
}
const inputStyle = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 14, width: "100%", boxSizing: "border-box" };

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FeriaApp() {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);

  // Config desde Firebase
  const [categorias, setCategorias] = useState([]);
  const [descuentos, setDescuentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [duenas, setDuenas] = useState([]);

  // Login
  const [usuario, setUsuario] = useState(() => localStorage.getItem("feria_usuario") || null);

  // Tabs
  const [tab, setTab] = useState("Cobro");

  // Carrito
  const [carrito, setCarrito] = useState([]);
  const [precioEditado, setPrecioEditado] = useState(null);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [scanning, setScanning] = useState(false);
  const [ventaConfirmada, setVentaConfirmada] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDuena, setManualDuena] = useState("");
  const [manualCat, setManualCat] = useState("");
  const [manualPrecio, setManualPrecio] = useState("");

  // Ventas
  const [ventas, setVentas] = useState([]);

  // Admin tabs
  const [adminTab, setAdminTab] = useState("categorias");

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Firebase init ──
  useEffect(() => {
    try {
      const app = initializeApp(FIREBASE_CONFIG);
      const firestore = getFirestore(app);
      setDb(firestore);
    } catch (e) { console.error("Firebase init error", e); setLoading(false); }
  }, []);

  // ── Load config ──
  useEffect(() => {
    if (!db) return;
    const loadAll = async () => {
      const [catDoc, descDoc, usrDoc, duenasDoc] = await Promise.all([
        getDoc(doc(db, "config", "categorias")),
        getDoc(doc(db, "config", "descuentos")),
        getDoc(doc(db, "config", "usuarios")),
        getDoc(doc(db, "config", "duenas")),
      ]);
      if (catDoc.exists()) setCategorias(catDoc.data().items || []);
      if (descDoc.exists()) setDescuentos(descDoc.data().items || []);
      if (usrDoc.exists()) setUsuarios(usrDoc.data().items || []);
      if (duenasDoc.exists()) setDuenas(duenasDoc.data().items || []);
      setLoading(false);
    };
    loadAll();
  }, [db]);

  // ── Listen ventas ──
  useEffect(() => {
    if (!db) return;
    const today = new Date().toISOString().split("T")[0];
    const q = query(collection(db, "ventas"), orderBy("timestamp", "desc"));
    return onSnapshot(q, snap => {
      setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.fecha === today));
    });
  }, [db]);

  // ── QR scan ──
  const handleScan = useCallback((data) => {
    setScanning(false);
    const parts = data.split("|");
    if (parts.length < 2) { showToast("QR inválido", "err"); return; }
    const [duena, catId, precioStr] = parts;
    const cat = categorias.find(c => c.id === catId);
    if (!cat) { showToast("Categoría no encontrada", "err"); return; }
    const precio = precioStr ? parseInt(precioStr) : cat.precio;
    if (!precio) { showToast("Prenda especial — ingresá el precio manualmente", "warn"); return; }
    agregarAlCarrito(duena, cat, precio);
  }, [categorias]);

  const agregarAlCarrito = (duena, cat, precio) => {
    setCarrito(prev => [...prev, { id: Date.now() + Math.random(), duena, categoria: cat.nombre, catId: cat.id, precio }]);
    setPrecioEditado(null);
    showToast(`${cat.nombre} de ${duena} agregado`);
  };

  // ── Cálculos ──
  const totalOriginal = carrito.reduce((s, i) => s + i.precio, 0);
  const pctAuto = calcularDescuento(carrito.length, descuentos);
  const totalConDescAuto = Math.round(totalOriginal * (1 - pctAuto / 100));
  const precioFinal = precioEditado !== null ? precioEditado : totalConDescAuto;
  const descuentoTotal = totalOriginal - precioFinal;
  const pctReal = totalOriginal > 0 ? Math.round((descuentoTotal / totalOriginal) * 100) : 0;
  const itemsProrateados = prorratear(carrito, precioFinal);

  const resumenCarrito = () => {
    const por = {};
    for (const item of itemsProrateados) {
      if (!por[item.duena]) por[item.duena] = 0;
      por[item.duena] += item.precioFinal;
    }
    return por;
  };

  // ── Registrar venta ──
  const registrarVenta = async () => {
    if (carrito.length === 0) return;
    const resumen = resumenCarrito();
    const venta = {
      fecha: new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
      vendedor: usuario,
      metodo: metodoPago,
      totalOriginal,
      totalFinal: precioFinal,
      descuento: descuentoTotal,
      items: itemsProrateados,
      porDuena: resumen,
    };
    if (db) await addDoc(collection(db, "ventas"), venta);
    setVentaConfirmada(venta);
    setCarrito([]);
    setPrecioEditado(null);
  };

  // ── Guardar config ──
  const guardar = async (coleccion, datos) => {
    if (db) await setDoc(doc(db, "config", coleccion), { items: datos });
  };

  const isAdmin = () => {
    const u = usuarios.find(u => u.nombre === usuario);
    return u?.admin === true;
  };

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👗</div>
          <p style={{ color: C.inkLight }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // ── Bootstrap: sin usuarios, mostrar admin directo ──
  if (usuarios.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <div style={{ background: C.admin, color: "#fff", padding: "14px 20px 10px" }}>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1 }}>FERIA DE ROPA</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Configuración inicial</div>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>
          <p style={{ color: C.inkLight, fontSize: 14, marginBottom: 20 }}>
            Antes de usar la app, configurá las dueñas, categorías, descuentos y vendedores.
          </p>
          <TabAdmin
            adminTab={adminTab} setAdminTab={setAdminTab}
            categorias={categorias} setCategorias={setCategorias}
            descuentos={descuentos} setDescuentos={setDescuentos}
            usuarios={usuarios} setUsuarios={setUsuarios}
            duenas={duenas} setDuenas={setDuenas}
            guardar={guardar} showToast={showToast}
          />
        </div>
        {toast && (
          <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: C.success, color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 2000 }}>{toast.msg}</div>
        )}
      </div>
    );
  }

  // ── Login ──
  if (!usuario || !usuarios.find(u => u.nombre === usuario)) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui", padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>👗</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>Feria de ropa</h1>
        <p style={{ color: C.inkLight, marginBottom: 40, fontSize: 14 }}>¿Quién sos?</p>
        {usuarios.map(u => (
          <button key={u.nombre} onClick={() => { setUsuario(u.nombre); localStorage.setItem("feria_usuario", u.nombre); }} style={{ width: 240, padding: "16px 0", marginBottom: 16, background: u.color || C.ink, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            {u.nombre}
          </button>
        ))}
      </div>
    );
  }

  // ── Venta confirmada ──
  if (ventaConfirmada) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui", maxWidth: 480, margin: "0 auto", padding: 20 }}>
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <p style={{ fontSize: 28, fontWeight: 700, color: C.ink, margin: "12px 0 4px" }}>{fmt(ventaConfirmada.totalFinal)}</p>
          <p style={{ color: C.inkLight, marginBottom: 24 }}>{ventaConfirmada.metodo} · {ventaConfirmada.items.length} prenda{ventaConfirmada.items.length !== 1 ? "s" : ""}</p>
          {Object.entries(ventaConfirmada.porDuena).map(([d, m]) => (
            <div key={d} style={{ background: C.tag, borderRadius: 10, padding: "10px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: colorFor(d, duenas), fontWeight: 600 }}>{d}</span>
              <span style={{ fontWeight: 700 }}>{fmt(m)}</span>
            </div>
          ))}
          <Btn onClick={() => setVentaConfirmada(null)} style={{ marginTop: 24 }}>Nueva venta</Btn>
        </div>
      </div>
    );
  }

  const adminMode = usuario === "admin" || isAdmin();
  const tabs = adminMode ? ["Cobro", "Resumen", "Admin"] : ["Cobro", "Resumen"];

  // ── Main UI ──
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: usuario === "admin" ? C.admin : (colorFor(usuario, usuarios) || C.ink), color: "#fff", padding: "14px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1 }}>FERIA DE ROPA</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{usuario}</div>
        </div>
        <button onClick={() => { setUsuario(null); localStorage.removeItem("feria_usuario"); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Cambiar</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "12px 0", border: "none", background: "none", fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? (usuario === "admin" ? C.admin : colorFor(usuario, usuarios)) : C.inkLight, borderBottom: tab === t ? `2px solid ${usuario === "admin" ? C.admin : colorFor(usuario, usuarios)}` : "2px solid transparent", cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {tab === "Cobro" && (
          <TabCobro
            carrito={carrito} setCarrito={setCarrito}
            categorias={categorias} duenas={duenas}
            totalOriginal={totalOriginal} pctAuto={pctAuto}
            totalConDescAuto={totalConDescAuto} precioFinal={precioFinal}
            precioEditado={precioEditado} setPrecioEditado={setPrecioEditado}
            pctReal={pctReal} descuentoTotal={descuentoTotal}
            itemsProrateados={itemsProrateados} resumenCarrito={resumenCarrito}
            metodoPago={metodoPago} setMetodoPago={setMetodoPago}
            registrarVenta={registrarVenta} setScanning={setScanning}
            manualMode={manualMode} setManualMode={setManualMode}
            manualDuena={manualDuena} setManualDuena={setManualDuena}
            manualCat={manualCat} setManualCat={setManualCat}
            manualPrecio={manualPrecio} setManualPrecio={setManualPrecio}
            agregarAlCarrito={agregarAlCarrito} colorFor={colorFor}
          />
        )}
        {tab === "Resumen" && <TabResumen ventas={ventas} duenas={duenas} colorFor={colorFor} />}
        {tab === "Admin" && adminMode && (
          <TabAdmin
            adminTab={adminTab} setAdminTab={setAdminTab}
            categorias={categorias} setCategorias={setCategorias}
            descuentos={descuentos} setDescuentos={setDescuentos}
            usuarios={usuarios} setUsuarios={setUsuarios}
            duenas={duenas} setDuenas={setDuenas}
            guardar={guardar} showToast={showToast}
          />
        )}
      </div>

      {scanning && <QRScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      {toast && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: toast.type === "err" ? C.danger : toast.type === "warn" ? "#E67E22" : C.success, color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── TAB COBRO ────────────────────────────────────────────────────────────────
function TabCobro({ carrito, setCarrito, categorias, duenas, totalOriginal, pctAuto, totalConDescAuto, precioFinal, precioEditado, setPrecioEditado, pctReal, descuentoTotal, itemsProrateados, resumenCarrito, metodoPago, setMetodoPago, registrarVenta, setScanning, manualMode, setManualMode, manualDuena, setManualDuena, manualCat, setManualCat, manualPrecio, setManualPrecio, agregarAlCarrito, colorFor }) {
  const catSeleccionada = categorias.find(c => c.id === manualCat);

  const agregarManual = () => {
    if (!catSeleccionada || !manualDuena) return;
    const precio = catSeleccionada.precio || (manualPrecio ? parseInt(manualPrecio) : null);
    if (!precio) return;
    agregarAlCarrito(manualDuena, catSeleccionada, precio);
    setManualMode(false);
    setManualCat(""); setManualPrecio("");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Btn onClick={() => setScanning(true)} style={{ flex: 1, background: C.ink }}>📷 Escanear QR</Btn>
        <Btn onClick={() => setManualMode(m => !m)} style={{ flex: 1, background: manualMode ? C.accent : C.surface, color: manualMode ? "#fff" : C.ink, border: `1px solid ${C.border}` }}>✏️ Manual</Btn>
      </div>

      {manualMode && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Agregar prenda manualmente</p>
          <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 6 }}>¿De quién es?</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {duenas.map(d => (
              <button key={d.nombre} onClick={() => setManualDuena(d.nombre)} style={{ padding: "8px 14px", background: manualDuena === d.nombre ? d.color : C.tag, color: manualDuena === d.nombre ? "#fff" : C.ink, border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{d.nombre}</button>
            ))}
          </div>
          <select value={manualCat} onChange={e => setManualCat(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
            <option value="">Seleccioná categoría...</option>
            {categorias.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}{c.precio ? ` — ${fmt(c.precio)}` : " — precio especial"}</option>
            ))}
          </select>
          {catSeleccionada && !catSeleccionada.precio && (
            <input type="number" placeholder="Precio especial" value={manualPrecio} onChange={e => setManualPrecio(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          <Btn onClick={agregarManual} style={{ width: "100%" }} disabled={!catSeleccionada || !manualDuena}>Agregar al carrito</Btn>
        </Card>
      )}

      {carrito.length > 0 ? (
        <>
          <div style={{ marginBottom: 12 }}>
            {carrito.map(item => (
              <div key={item.id} style={{ background: C.surface, borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", border: `1px solid ${C.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorFor(item.duena, duenas), marginRight: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.categoria}</div>
                  <div style={{ fontSize: 12, color: colorFor(item.duena, duenas) }}>{item.duena}</div>
                </div>
                <div style={{ fontWeight: 700, marginRight: 10 }}>{fmt(item.precio)}</div>
                <button onClick={() => setCarrito(c => c.filter(x => x.id !== item.id))} style={{ background: "none", border: "none", color: C.danger, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>✕</button>
              </div>
            ))}
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Row label="Subtotal" value={fmt(totalOriginal)} />
            {pctAuto > 0 && <Row label={`Descuento ${carrito.length} prendas (${pctAuto}%)`} value={`−${fmt(totalOriginal - totalConDescAuto)}`} muted />}
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: C.inkLight, flex: 1 }}>Precio final</span>
              <span style={{ color: C.inkLight, fontSize: 14 }}>$</span>
              <input type="number" value={precioEditado !== null ? precioEditado : totalConDescAuto} onChange={e => setPrecioEditado(Number(e.target.value))} style={{ width: 110, padding: "6px 8px", borderRadius: 8, border: `2px solid ${C.ink}`, fontSize: 18, fontWeight: 700, textAlign: "right" }} />
            </div>
            {precioEditado !== null && precioEditado !== totalConDescAuto && (
              <p style={{ fontSize: 11, color: C.inkLight, margin: "4px 0 0", textAlign: "right" }}>Descuento total: {pctReal}% (−{fmt(descuentoTotal)})</p>
            )}
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 6 }}>Distribución</p>
              {Object.entries(resumenCarrito()).map(([d, m]) => (
                <Row key={d} label={d} value={fmt(m)} color={colorFor(d, duenas)} bold />
              ))}
            </div>
          </Card>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["efectivo", "transferencia"].map(m => (
              <button key={m} onClick={() => setMetodoPago(m)} style={{ flex: 1, padding: "10px 0", background: metodoPago === m ? C.ink : C.surface, color: metodoPago === m ? "#fff" : C.ink, border: `1px solid ${C.border}`, borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {m === "efectivo" ? "💵 Efectivo" : "📲 Transferencia"}
              </button>
            ))}
          </div>

          <Btn onClick={registrarVenta} style={{ width: "100%", fontSize: 17, padding: "16px 0", background: C.success }}>
            Confirmar venta · {fmt(precioFinal)}
          </Btn>
          <button onClick={() => { setCarrito([]); setPrecioEditado(null); }} style={{ width: "100%", marginTop: 10, padding: "10px 0", background: "none", border: "none", color: C.danger, fontSize: 13, cursor: "pointer" }}>
            Cancelar y vaciar carrito
          </button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 0", color: C.inkLight }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
          <p>El carrito está vacío.<br />Escaneá un QR o agregá una prenda manualmente.</p>
        </div>
      )}
    </div>
  );
}

// ── TAB RESUMEN ──────────────────────────────────────────────────────────────
function TabResumen({ ventas, duenas, colorFor }) {
  const [verVentas, setVerVentas] = useState(false);

  // ── Totales por dueña ──
  const totalPorDuena = {};
  duenas.forEach(d => { totalPorDuena[d.nombre] = 0; });
  for (const v of ventas) {
    for (const [duena, monto] of Object.entries(v.porDuena || {})) {
      if (totalPorDuena[duena] !== undefined) totalPorDuena[duena] += monto;
      else totalPorDuena[duena] = monto;
    }
  }

  // ── Transferencias recibidas por vendedor ──
  // clave: nombre vendedor → monto transferencia recibida
  const transferPorVendedor = {};
  for (const v of ventas) {
    if (v.metodo === "transferencia") {
      if (!transferPorVendedor[v.vendedor]) transferPorVendedor[v.vendedor] = 0;
      transferPorVendedor[v.vendedor] += v.totalFinal;
    }
  }

  // ── Efectivo total en caja ──
  const efectivoTotal = ventas.filter(v => v.metodo === "efectivo").reduce((s, v) => s + v.totalFinal, 0);

  // ── Efectivo en caja por dueña (prorrateo) ──
  const efectivoPorDuena = {};
  duenas.forEach(d => { efectivoPorDuena[d.nombre] = 0; });
  for (const v of ventas.filter(v => v.metodo === "efectivo")) {
    for (const [duena, monto] of Object.entries(v.porDuena || {})) {
      if (efectivoPorDuena[duena] !== undefined) efectivoPorDuena[duena] += monto;
      else efectivoPorDuena[duena] = monto;
    }
  }

  // ── Transferencias por dueña (prorrateo de ventas por transferencia) ──
  const transferPorDuena = {};
  duenas.forEach(d => { transferPorDuena[d.nombre] = 0; });
  for (const v of ventas.filter(v => v.metodo === "transferencia")) {
    for (const [duena, monto] of Object.entries(v.porDuena || {})) {
      if (transferPorDuena[duena] !== undefined) transferPorDuena[duena] += monto;
      else transferPorDuena[duena] = monto;
    }
  }

  // ── Compensación ──
  // Cada dueña ya "cobró" lo de sus transferencias (según quién vendió)
  // El efectivo en caja se reparte según cuánto efectivo le corresponde a cada una
  // Si lo que le toca en efectivo > lo que hay en caja: necesita transferencia extra
  const totalGeneral = Object.values(totalPorDuena).reduce((s, v) => s + v, 0);

  // Para la compensación necesitamos saber cuánto efectivo cobró cada vendedor
  // y cuánto le corresponde a cada dueña del efectivo
  // Al cierre: dueña recibe efectivoPorDuena[d] en efectivo de caja
  // + transferPorDuena[d] ya cobrado vía transferencia
  // Total recibido = efectivoPorDuena[d] + transferPorDuena[d]
  // Diferencia con lo que le corresponde = totalPorDuena[d] - efectivoPorDuena[d] - transferPorDuena[d]
  // (debería ser 0 si todo cierra bien)

  // Calculamos quién le debe a quién para compensar el efectivo
  // Cada vendedor tiene en su bolsillo las transferencias que cobró
  // El efectivo está en caja común → al cierre se reparte según efectivoPorDuena
  // Si transferPorVendedor[vendedor] != transferPorDuena[dueña del vendedor] → hay diferencia

  // Simplificado: al cierre de feria
  // 1. Contar efectivo en caja → repartir según efectivoPorDuena
  // 2. Cada una ya tiene sus transferencias (cobradas por ella misma o por la otra)
  // 3. Calcular quién le debe a quién

  // Saldo pendiente por dueña = lo que le corresponde - (efectivo que le toca + transfer ya cobradas por esa dueña como vendedora)
  // Nota: transferPorVendedor usa el nombre del vendedor, no de la dueña
  // Asumimos que cada vendedora cobra transferencias para sí misma
  const pendientePorDuena = {};
  duenas.forEach(d => {
    const cobradoTransfer = transferPorVendedor[d.nombre] || 0;
    const cobradoEfectivo = efectivoPorDuena[d.nombre] || 0;
    pendientePorDuena[d.nombre] = totalPorDuena[d.nombre] - cobradoTransfer - cobradoEfectivo;
  });

  // Generar instrucción de compensación
  const compensacion = [];
  const deudores = Object.entries(pendientePorDuena).filter(([, v]) => v < 0).map(([n, v]) => ({ nombre: n, monto: Math.abs(v) }));
  const acreedores = Object.entries(pendientePorDuena).filter(([, v]) => v > 0).map(([n, v]) => ({ nombre: n, monto: v }));
  for (const acreedor of acreedores) {
    for (const deudor of deudores) {
      if (acreedor.monto > 0 && deudor.monto > 0) {
        const monto = Math.min(acreedor.monto, deudor.monto);
        compensacion.push({ de: deudor.nombre, para: acreedor.nombre, monto });
        acreedor.monto -= monto;
        deudor.monto -= monto;
      }
    }
  }

  return (
    <div>
      {/* ── Resumen por dueña ── */}
      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>RECAUDACIÓN POR DUEÑA</p>
        {duenas.map(d => {
          const total = totalPorDuena[d.nombre] || 0;
          return (
            <div key={d.nombre} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: colorFor(d.nombre, duenas) }}>{d.nombre}</span>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{fmt(total)}</span>
              </div>
              <div style={{ height: 5, background: C.tag, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: totalGeneral > 0 ? `${(total / totalGeneral) * 100}%` : "0%", background: colorFor(d.nombre, duenas), borderRadius: 3, transition: "width 0.4s" }} />
              </div>
            </div>
          );
        })}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.inkLight, fontSize: 13 }}>Total recaudado</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{fmt(totalGeneral)}</span>
        </div>
        <p style={{ fontSize: 12, color: C.inkLight, marginTop: 4 }}>{ventas.length} venta{ventas.length !== 1 ? "s" : ""}</p>
      </Card>

      {/* ── Arqueo de caja ── */}
      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>ARQUEO DE CAJA</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: C.tag, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>💵 EFECTIVO</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmt(efectivoTotal)}</div>
          </div>
          <div style={{ flex: 1, background: C.tag, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>📲 TRANSFER</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmt(totalGeneral - efectivoTotal)}</div>
          </div>
        </div>

        <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 8, fontWeight: 600 }}>DESGLOSE EFECTIVO EN CAJA</p>
        {duenas.map(d => (
          <Row key={d.nombre} label={d.nombre} value={fmt(efectivoPorDuena[d.nombre] || 0)} color={colorFor(d.nombre, duenas)} bold />
        ))}

        <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />
        <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 8, fontWeight: 600 }}>TRANSFERENCIAS YA COBRADAS</p>
        {duenas.map(d => (
          <Row key={d.nombre} label={`${d.nombre} cobró`} value={fmt(transferPorVendedor[d.nombre] || 0)} color={colorFor(d.nombre, duenas)} />
        ))}
      </Card>

      {/* ── Compensación al cierre ── */}
      <Card style={{ marginBottom: 12, border: `1px solid ${compensacion.length > 0 ? "#E67E22" : C.success}` }}>
        <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>COMPENSACIÓN AL CIERRE</p>
        {compensacion.length === 0 ? (
          <p style={{ color: C.success, fontWeight: 600, fontSize: 14 }}>✓ Todo está compensado con el efectivo en caja</p>
        ) : (
          compensacion.map((c, i) => (
            <div key={i} style={{ background: "#FFF3E0", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                <span style={{ color: colorFor(c.de, duenas) }}>{c.de}</span>
                {" → "}
                <span style={{ color: colorFor(c.para, duenas) }}>{c.para}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmt(c.monto)}</div>
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>Transferencia o efectivo extra</div>
            </div>
          ))
        )}
      </Card>

      {/* ── Detalle ventas ── */}
      <button onClick={() => setVerVentas(v => !v)} style={{ width: "100%", padding: "10px 0", background: "none", border: `1px solid ${C.border}`, borderRadius: 10, color: C.inkLight, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
        {verVentas ? "Ocultar detalle de ventas" : `Ver detalle (${ventas.length} ventas)`}
      </button>

      {verVentas && ventas.map(v => (
        <Card key={v.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(v.totalFinal)}</span>
              {v.descuento > 0 && <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 6 }}>(−{fmt(v.descuento)})</span>}
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{v.metodo} · {v.vendedor} · {v.items?.length} prenda{v.items?.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {Object.entries(v.porDuena || {}).map(([d, m]) => (
                <div key={d} style={{ fontSize: 12, color: colorFor(d, duenas), fontWeight: 600 }}>{d}: {fmt(m)}</div>
              ))}
            </div>
          </div>
        </Card>
      ))}
      {ventas.length === 0 && <p style={{ textAlign: "center", color: C.inkLight, padding: 40 }}>Todavía no hay ventas hoy.</p>}
    </div>
  );
}

// ── TAB ADMIN ────────────────────────────────────────────────────────────────
function TabAdmin({ adminTab, setAdminTab, categorias, setCategorias, descuentos, setDescuentos, usuarios, setUsuarios, duenas, setDuenas, guardar, showToast }) {
  const [localCats, setLocalCats] = useState(categorias);
  const [localDesc, setLocalDesc] = useState(descuentos);
  const [localUsers, setLocalUsers] = useState(usuarios);
  const [localDuenas, setLocalDuenas] = useState(duenas);

  useEffect(() => setLocalCats(categorias), [categorias]);
  useEffect(() => setLocalDesc(descuentos), [descuentos]);
  useEffect(() => setLocalUsers(usuarios), [usuarios]);
  useEffect(() => setLocalDuenas(duenas), [duenas]);

  const save = async (key, data, setter, localSetter) => {
    setter(data);
    await guardar(key, data);
    showToast("Guardado ✓");
  };

  const COLORS = ["#D4845A", "#5A8FA3", "#5A9E72", "#9B5EA3", "#E67E22", "#C0392B", "#2C3E50"];

  const tabs = [
    { id: "categorias", label: "Categorías" },
    { id: "descuentos", label: "Descuentos" },
    { id: "duenas", label: "Dueñas" },
    { id: "usuarios", label: "Vendedores" },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setAdminTab(t.id)} style={{ padding: "8px 14px", background: adminTab === t.id ? C.admin : C.surface, color: adminTab === t.id ? "#fff" : C.ink, border: `1px solid ${C.border}`, borderRadius: 20, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {/* CATEGORÍAS */}
      {adminTab === "categorias" && (
        <>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>Nombre de la categoría y precio base. Dejá el precio vacío para prendas de precio libre.</p>
          {localCats.map((cat, i) => (
            <Card key={cat.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <input value={cat.nombre} placeholder="Nombre" onChange={e => { const n = [...localCats]; n[i] = { ...n[i], nombre: e.target.value }; setLocalCats(n); }} style={{ ...inputStyle, flex: 2 }} />
              <input type="number" placeholder="Precio" value={cat.precio || ""} onChange={e => { const n = [...localCats]; n[i] = { ...n[i], precio: e.target.value ? parseInt(e.target.value) : null }; setLocalCats(n); }} style={{ ...inputStyle, width: 100, textAlign: "right" }} />
              <button onClick={() => setLocalCats(c => c.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.danger, fontSize: 20, cursor: "pointer", flexShrink: 0 }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalCats(c => [...c, { id: `cat_${Date.now()}`, nombre: "", precio: null }])} style={{ width: "100%", padding: "10px 0", background: "none", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.inkLight, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>+ Agregar categoría</button>
          <Btn onClick={() => save("categorias", localCats, setCategorias)} style={{ width: "100%" }}>Guardar categorías</Btn>
        </>
      )}

      {/* DESCUENTOS */}
      {adminTab === "descuentos" && (
        <>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>Descuento automático según cantidad de prendas en una compra.</p>
          {localDesc.map((row, i) => (
            <Card key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: C.inkLight, flexShrink: 0 }}>Desde</span>
              <input type="number" value={row.cantidad} onChange={e => { const n = [...localDesc]; n[i] = { ...n[i], cantidad: parseInt(e.target.value) }; setLocalDesc(n); }} style={{ ...inputStyle, width: 60, textAlign: "center" }} />
              <span style={{ fontSize: 13, color: C.inkLight, flexShrink: 0 }}>prendas →</span>
              <input type="number" value={row.porcentaje} onChange={e => { const n = [...localDesc]; n[i] = { ...n[i], porcentaje: parseInt(e.target.value) }; setLocalDesc(n); }} style={{ ...inputStyle, width: 60, textAlign: "center" }} />
              <span style={{ fontSize: 13, color: C.inkLight }}>%</span>
              <button onClick={() => setLocalDesc(d => d.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.danger, fontSize: 20, cursor: "pointer" }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalDesc(d => [...d, { cantidad: 2, porcentaje: 0 }])} style={{ width: "100%", padding: "10px 0", background: "none", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.inkLight, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>+ Agregar escala</button>
          <Btn onClick={() => save("descuentos", localDesc, setDescuentos)} style={{ width: "100%" }}>Guardar descuentos</Btn>
        </>
      )}

      {/* DUEÑAS */}
      {adminTab === "duenas" && (
        <>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>Las dueñas de las prendas. La recaudación se divide entre ellas.</p>
          {localDuenas.map((d, i) => (
            <Card key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <input value={d.nombre} placeholder="Nombre" onChange={e => { const n = [...localDuenas]; n[i] = { ...n[i], nombre: e.target.value }; setLocalDuenas(n); }} style={{ ...inputStyle, flex: 1 }} />
              <div style={{ display: "flex", gap: 4 }}>
                {COLORS.map(col => (
                  <button key={col} onClick={() => { const n = [...localDuenas]; n[i] = { ...n[i], color: col }; setLocalDuenas(n); }} style={{ width: 24, height: 24, borderRadius: "50%", background: col, border: d.color === col ? "3px solid #2C2416" : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
              <button onClick={() => setLocalDuenas(x => x.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.danger, fontSize: 20, cursor: "pointer" }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalDuenas(x => [...x, { nombre: "", color: COLORS[0] }])} style={{ width: "100%", padding: "10px 0", background: "none", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.inkLight, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>+ Agregar dueña</button>
          <Btn onClick={() => save("duenas", localDuenas, setDuenas)} style={{ width: "100%" }}>Guardar dueñas</Btn>
        </>
      )}

      {/* VENDEDORES */}
      {adminTab === "usuarios" && (
        <>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>Las personas que van a operar la app el día de la feria.</p>
          {localUsers.map((u, i) => (
            <Card key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <input value={u.nombre} placeholder="Nombre" onChange={e => { const n = [...localUsers]; n[i] = { ...n[i], nombre: e.target.value }; setLocalUsers(n); }} style={{ ...inputStyle, flex: 1 }} />
              <div style={{ display: "flex", gap: 4 }}>
                {COLORS.map(col => (
                  <button key={col} onClick={() => { const n = [...localUsers]; n[i] = { ...n[i], color: col }; setLocalUsers(n); }} style={{ width: 24, height: 24, borderRadius: "50%", background: col, border: u.color === col ? "3px solid #2C2416" : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
              <label style={{ fontSize: 12, color: C.inkLight, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <input type="checkbox" checked={u.admin || false} onChange={e => { const n = [...localUsers]; n[i] = { ...n[i], admin: e.target.checked }; setLocalUsers(n); }} />
                Admin
              </label>
              <button onClick={() => setLocalUsers(x => x.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.danger, fontSize: 20, cursor: "pointer" }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalUsers(x => [...x, { nombre: "", color: COLORS[1], admin: false }])} style={{ width: "100%", padding: "10px 0", background: "none", border: `1px dashed ${C.border}`, borderRadius: 10, color: C.inkLight, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>+ Agregar vendedor/a</button>
          <Btn onClick={() => save("usuarios", localUsers, setUsuarios)} style={{ width: "100%" }}>Guardar vendedores</Btn>
        </>
      )}
    </div>
  );
}
