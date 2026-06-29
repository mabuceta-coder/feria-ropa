import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, onSnapshot, query, orderBy, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scanMode, setScanMode] = useState("venta"); // "venta" | "devolucion" | "cambio"
  const [devolucionData, setDevolucionData] = useState(null);
  const [cambioNuevaPrenda, setCambioNuevaPrenda] = useState(null);

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
    if (scanMode === "devolucion") { handleScanDevolucion(data); return; }
    if (scanMode === "cambio") { handleScanCambio(data); return; }
    setScanning(false);
    const parts = data.split("|");
    if (parts.length < 2) { showToast("QR inválido", "err"); return; }
    const [duena, catId, precioStr, prendaId] = parts;
    const precio = precioStr ? parseInt(precioStr) : null;
    if (!precio) { showToast("QR sin precio — usá modo manual", "warn"); return; }
    // QR genérico
    if (catId === "generica") {
      agregarAlCarrito(duena, { nombre: "Genérica", id: "generica" }, precio, "GEN-" + Date.now());
      return;
    }
    const cat = categorias.find(c => c.id === catId);
    if (!cat) { showToast("Categoría no encontrada", "err"); return; }
    // Verificar que no esté ya en el carrito
    if (prendaId && carrito.find(i => i.prendaId === prendaId)) {
      showToast("Esta prenda ya está en el carrito", "warn"); return;
    }
    agregarAlCarrito(duena, cat, precio, prendaId);
  }, [categorias, scanMode, carrito]);

  const agregarAlCarrito = (duena, cat, precio, prendaId = null) => {
    setCarrito(prev => [...prev, { id: Date.now() + Math.random(), duena, categoria: cat.nombre, catId: cat.id, precio, prendaId }]);
    setPrecioEditado(null);
    showToast(`${cat.nombre} de ${duena} agregado`);
  };

  // ── Devolución/Cambio ──
  const handleScanDevolucion = useCallback(async (data) => {
    setScanning(false);
    const parts = data.split("|");
    const prendaId = parts[3];
    if (!prendaId) { showToast("Esta etiqueta no tiene ID — formato viejo", "err"); return; }
    // Buscar en ventas del día
    let prendaEncontrada = null;
    let ventaOrigen = null;
    for (const v of ventas) {
      const item = v.items?.find(i => i.prendaId === prendaId);
      if (item) { prendaEncontrada = item; ventaOrigen = v; break; }
    }
    if (!prendaEncontrada) { showToast("Prenda no encontrada en ventas de hoy", "err"); return; }
    setDevolucionData({ prenda: prendaEncontrada, venta: ventaOrigen });
  }, [ventas]);

  const handleScanCambio = useCallback(async (data) => {
    setScanning(false);
    const parts = data.split("|");
    const [duena, catId, precioStr, prendaId] = parts;
    const cat = categorias.find(c => c.id === catId);
    if (!cat) { showToast("Categoría no encontrada", "err"); return; }
    const precio = precioStr ? parseInt(precioStr) : cat.precio;
    setCambioNuevaPrenda({ duena, cat, precio, prendaId });
    setScanMode("venta");
  }, [categorias]);

  const confirmarDevolucion = async (metodoDev) => {
    if (!devolucionData) return;
    const { prenda, venta } = devolucionData;
    const trx = {
      tipo: "devolucion",
      fecha: new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
      hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      vendedor: usuario,
      metodo: metodoDev,
      prendaId: prenda.prendaId,
      categoria: prenda.categoria,
      duena: prenda.duena,
      montoDevuelto: prenda.precioFinal,
      ventaOrigenId: venta.id,
      porDuena: { [prenda.duena]: -prenda.precioFinal },
      totalFinal: -prenda.precioFinal,
    };
    if (db) await addDoc(collection(db, "ventas"), trx);
    showToast(`Devolución registrada: ${fmt(prenda.precioFinal)}`);
    setDevolucionData(null);
    setScanMode("venta");
    setTab("Resumen");
  };

  const confirmarCambio = async () => {
    if (!devolucionData || !cambioNuevaPrenda) return;
    const { prenda: prendaVieja, venta } = devolucionData;
    const diferencia = cambioNuevaPrenda.precio - prendaVieja.precioFinal;
    const trx = {
      tipo: "cambio",
      fecha: new Date().toISOString().split("T")[0],
      timestamp: Date.now(),
      vendedor: usuario,
      prendaDevueltaId: prendaVieja.prendaId,
      prendaDevuelta: prendaVieja.categoria,
      duenaDevuelta: prendaVieja.duena,
      prendaNuevaId: cambioNuevaPrenda.prendaId,
      prendaNueva: cambioNuevaPrenda.cat.nombre,
      duenaNueva: cambioNuevaPrenda.duena,
      diferencia,
      ventaOrigenId: venta.id,
      porDuena: {
        [prendaVieja.duena]: -prendaVieja.precioFinal,
        [cambioNuevaPrenda.duena]: cambioNuevaPrenda.precio,
      },
      totalFinal: diferencia,
    };
    if (db) await addDoc(collection(db, "ventas"), trx);
    showToast(`Cambio registrado${diferencia > 0 ? ` — cliente paga ${fmt(diferencia)} extra` : ""}`);
    setDevolucionData(null);
    setCambioNuevaPrenda(null);
    setScanMode("venta");
    setTab("Resumen");
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
  const menuItems = adminMode
    ? [{ id: "Cobro", icon: "🛍️", label: "Cobrar" }, { id: "Resumen", icon: "📊", label: "Resumen y arqueo" }, { id: "Admin", icon: "⚙️", label: "Administración" }]
    : [{ id: "Cobro", icon: "🛍️", label: "Cobrar" }, { id: "Resumen", icon: "📊", label: "Resumen y arqueo" }];
  const drawerExtra = adminMode ? [{ id: "devolucion", icon: "↩️", label: "Devolución / cambio" }] : [];

  const headerColor = usuario === "admin" ? C.admin : (colorFor(usuario, usuarios) || C.ink);

  // ── Main UI ──
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 900 }} />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, left: 0, height: "100%", width: 260,
        background: C.surface, zIndex: 1000,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        display: "flex", flexDirection: "column",
        boxShadow: drawerOpen ? "4px 0 20px rgba(0,0,0,0.15)" : "none"
      }}>
        {/* Drawer header */}
        <div style={{ background: headerColor, padding: "20px 16px 16px", color: "#fff" }}>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1, marginBottom: 2 }}>FERIA DE ROPA</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{usuario}</div>
        </div>
        {/* Menu items */}
        <div style={{ flex: 1, padding: "12px 0" }}>
          {menuItems.map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setDrawerOpen(false); }} style={{
              width: "100%", padding: "14px 20px", border: "none", background: tab === item.id ? C.tag : "none",
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              borderLeft: tab === item.id ? `3px solid ${headerColor}` : "3px solid transparent",
              fontSize: 15, fontWeight: tab === item.id ? 700 : 400,
              color: tab === item.id ? headerColor : C.ink,
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        {/* Extra items admin */}
        {drawerExtra.map(item => (
          <button key={item.id} onClick={() => { setScanMode("devolucion"); setScanning(true); setDrawerOpen(false); }} style={{
            width: "100%", padding: "14px 20px", border: "none", background: "none",
            display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            borderLeft: "3px solid transparent",
            fontSize: 15, fontWeight: 400, color: C.danger,
          }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
        {/* Cambiar usuario */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => { setUsuario(null); localStorage.removeItem("feria_usuario"); setDrawerOpen(false); }} style={{
            width: "100%", padding: "10px 0", background: C.tag, border: "none",
            borderRadius: 10, color: C.inkLight, fontSize: 13, fontWeight: 600, cursor: "pointer"
          }}>
            Cambiar usuario
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ background: headerColor, color: "#fff", padding: "14px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => setDrawerOpen(d => !d)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: "0 8px 0 0", lineHeight: 1 }}>☰</button>
        <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>
          {menuItems.find(m => m.id === tab)?.icon} {menuItems.find(m => m.id === tab)?.label}
        </div>
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
            setScanMode={setScanMode} isAdmin={adminMode}
            manualMode={manualMode} setManualMode={setManualMode}
            manualDuena={manualDuena} setManualDuena={setManualDuena}
            manualCat={manualCat} setManualCat={setManualCat}
            manualPrecio={manualPrecio} setManualPrecio={setManualPrecio}
            agregarAlCarrito={agregarAlCarrito} colorFor={colorFor}
          />
        )}
        {tab === "Resumen" && <TabResumen ventas={ventas} duenas={duenas} colorFor={colorFor} db={db} isAdmin={adminMode} />}
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

      {/* ── Devolución modal ── */}
      {devolucionData && !cambioNuevaPrenda && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 800, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.surface, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Devolución</p>
            <p style={{ color: C.inkLight, fontSize: 13, marginBottom: 16 }}>Prenda encontrada en venta de hoy</p>
            <div style={{ background: C.tag, borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ fontWeight: 600 }}>{devolucionData.prenda.categoria}</div>
              <div style={{ fontSize: 13, color: C.inkLight }}>{devolucionData.prenda.duena}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{fmt(devolucionData.prenda.precioFinal)}</div>
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>Pagado originalmente · {devolucionData.venta.metodo}</div>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>¿Qué hacemos?</p>
            <button onClick={() => { setScanMode("cambio"); setScanning(true); }} style={{ width: "100%", padding: "12px 0", background: C.ink, color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
              📷 Escanear prenda de cambio
            </button>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => confirmarDevolucion("efectivo")} style={{ flex: 1, padding: "10px 0", background: C.danger, color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                💵 Devolver efectivo
              </button>
              <button onClick={() => confirmarDevolucion("transferencia")} style={{ flex: 1, padding: "10px 0", background: C.danger, color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                📲 Devolver transfer
              </button>
            </div>
            <button onClick={() => { setDevolucionData(null); setScanMode("venta"); }} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.inkLight, fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Cambio confirmación ── */}
      {devolucionData && cambioNuevaPrenda && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 800, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.surface, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Confirmar cambio</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: "#FFF0F0", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.danger, fontWeight: 600, marginBottom: 2 }}>DEVUELVE</div>
                <div style={{ fontWeight: 600 }}>{devolucionData.prenda.categoria}</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>{devolucionData.prenda.duena}</div>
                <div style={{ fontWeight: 700 }}>{fmt(devolucionData.prenda.precioFinal)}</div>
              </div>
              <div style={{ flex: 1, background: "#F0FFF4", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.success, fontWeight: 600, marginBottom: 2 }}>SE LLEVA</div>
                <div style={{ fontWeight: 600 }}>{cambioNuevaPrenda.cat.nombre}</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>{cambioNuevaPrenda.duena}</div>
                <div style={{ fontWeight: 700 }}>{fmt(cambioNuevaPrenda.precio)}</div>
              </div>
            </div>
            {cambioNuevaPrenda.precio - devolucionData.prenda.precioFinal > 0 && (
              <div style={{ background: C.tag, borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
                <span style={{ fontWeight: 600 }}>Cliente paga {fmt(cambioNuevaPrenda.precio - devolucionData.prenda.precioFinal)} extra</span>
              </div>
            )}
            {cambioNuevaPrenda.precio - devolucionData.prenda.precioFinal < 0 && (
              <div style={{ background: "#FFF3E0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
                <span style={{ fontWeight: 600 }}>Diferencia a favor del cliente: {fmt(devolucionData.prenda.precioFinal - cambioNuevaPrenda.precio)}</span>
              </div>
            )}
            <button onClick={confirmarCambio} style={{ width: "100%", padding: "14px 0", background: C.success, color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: "pointer", marginBottom: 8 }}>
              ✓ Confirmar cambio
            </button>
            <button onClick={() => setCambioNuevaPrenda(null)} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.inkLight, fontSize: 13, cursor: "pointer" }}>
              Escanear otra prenda
            </button>
          </div>
        </div>
      )}

      {scanning && <QRScanner onScan={handleScan} onClose={() => { setScanning(false); setScanMode("venta"); }} />}

      {toast && (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: toast.type === "err" ? C.danger : toast.type === "warn" ? "#E67E22" : C.success, color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── TAB COBRO ────────────────────────────────────────────────────────────────
function TabCobro({ carrito, setCarrito, categorias, duenas, totalOriginal, pctAuto, totalConDescAuto, precioFinal, precioEditado, setPrecioEditado, pctReal, descuentoTotal, itemsProrateados, resumenCarrito, metodoPago, setMetodoPago, registrarVenta, setScanning, setScanMode, isAdmin, manualMode, setManualMode, manualDuena, setManualDuena, manualCat, setManualCat, manualPrecio, setManualPrecio, agregarAlCarrito, colorFor }) {
  const catSeleccionada = categorias.find(c => c.id === manualCat);

  const agregarManual = () => {
    if (!catSeleccionada || !manualDuena) return;
    const precio = manualPrecio ? parseInt(manualPrecio) : null;
    if (!precio) return;
    agregarAlCarrito(manualDuena, catSeleccionada, precio);
    setManualMode(false);
    setManualCat(""); setManualPrecio("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 60px)" }}>
      {/* Botón venta manual arriba a la derecha */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setManualMode(m => !m)} style={{ padding: "8px 16px", background: manualMode ? C.accent : C.surface, color: manualMode ? "#fff" : C.ink, border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✏️ Venta manual</button>
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
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <input type="number" placeholder="Precio de la prenda" value={manualPrecio} onChange={e => setManualPrecio(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <Btn onClick={agregarManual} style={{ width: "100%" }} disabled={!catSeleccionada || !manualDuena}>Agregar al carrito</Btn>
        </Card>
      )}

      <div style={{ flex: 1 }}>
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
          <p>El carrito está vacío.<br />Escaneá un QR o usá venta manual.</p>
        </div>
      )}
      </div>

      {/* Botón QR grande fijo abajo */}
      <div style={{ position: "sticky", bottom: 0, background: C.bg, paddingTop: 12, paddingBottom: 8 }}>
        <button onClick={() => setScanning(true)} style={{
          width: "100%", padding: "18px 0",
          background: C.ink, color: "#fff",
          border: "none", borderRadius: 16,
          fontSize: 20, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5,
          boxShadow: "0 4px 16px rgba(44,36,22,0.3)"
        }}>
          📷 Escanear QR
        </button>
      </div>
    </div>
  );
}

// ── TAB RESUMEN ──────────────────────────────────────────────────────────────
function TabResumen({ ventas, duenas, colorFor, db, isAdmin }) {
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

  const [cerrando, setCerrando] = useState(false);
  const [confirmCierre, setConfirmCierre] = useState(false);

  const cerrarFeria = async () => {
    if (!db || ventas.length === 0) return;
    setCerrando(true);
    try {
      const fechaCierre = new Date().toISOString();
      const batch = writeBatch(db);
      // Archivar todas las ventas del día con marca de cierre
      const snap = await getDocs(query(collection(db, "ventas"), orderBy("timestamp", "desc")));
      snap.docs.forEach(d => {
        if (d.data().fecha === new Date().toISOString().split("T")[0]) {
          batch.update(d.ref, { cerrada: true, fechaCierre });
        }
      });
      await batch.commit();
      // Generar resumen en texto para copiar
      generarResumenTexto();
      setConfirmCierre(false);
    } catch(e) {
      console.error(e);
    }
    setCerrando(false);
  };

  const generarResumenTexto = () => {
    const fecha = new Date().toLocaleDateString("es-AR");
    const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    let txt = `CIERRE DE FERIA — ${fecha} ${hora}\n`;
    txt += `${"=".repeat(35)}\n\n`;
    txt += `RECAUDACIÓN POR DUEÑA\n`;
    duenas.forEach(d => {
      txt += `  ${d.nombre}: ${fmt(totalPorDuena[d.nombre] || 0)}\n`;
    });
    txt += `  TOTAL: ${fmt(totalGeneral)}\n\n`;
    txt += `ARQUEO\n`;
    txt += `  Efectivo en caja: ${fmt(efectivoTotal)}\n`;
    txt += `  Transferencias: ${fmt(totalGeneral - efectivoTotal)}\n\n`;
    txt += `COMPENSACIÓN\n`;
    if (compensacion.length === 0) {
      txt += `  Todo compensado con efectivo\n`;
    } else {
      compensacion.forEach(c => {
        txt += `  ${c.de} → ${c.para}: ${fmt(c.monto)}\n`;
      });
    }
    txt += `\nVENTAS: ${ventas.length}\n`;
    // Copiar al portapapeles
    navigator.clipboard?.writeText(txt).catch(() => {});
    // Mostrar en alert
    alert(`Feria cerrada ✓\n\nEl resumen fue copiado al portapapeles:\n\n${txt}`);
  };

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

      {/* ── Cerrar feria ── */}
      {isAdmin && ventas.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {!confirmCierre ? (
            <button onClick={() => setConfirmCierre(true)} style={{ width: "100%", padding: "14px 0", background: "none", border: `2px solid ${C.danger}`, borderRadius: 12, color: C.danger, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              🔒 Cerrar feria
            </button>
          ) : (
            <Card style={{ border: `2px solid ${C.danger}` }}>
              <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>¿Cerrar la feria?</p>
              <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 16 }}>Las ventas se archivarán. El resumen se copia al portapapeles. La app quedará lista para una nueva feria.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cerrarFeria} disabled={cerrando} style={{ flex: 1, padding: "12px 0", background: C.danger, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {cerrando ? "Cerrando..." : "Sí, cerrar"}
                </button>
                <button onClick={() => setConfirmCierre(false)} style={{ flex: 1, padding: "12px 0", background: C.tag, color: C.ink, border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

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
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{v.hora || ""} · {v.metodo} · {v.vendedor} · {v.items?.length} prenda{v.items?.length !== 1 ? "s" : ""}</div>
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
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>
            Cada categoría tiene variantes con su precio. Las variantes aparecen como opciones rápidas en el generador de etiquetas.
          </p>
          {localCats.map((cat, i) => (
            <Card key={cat.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <input value={cat.nombre} placeholder="Nombre de la categoría" onChange={e => { const n = [...localCats]; n[i] = { ...n[i], nombre: e.target.value }; setLocalCats(n); }} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setLocalCats(c => c.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.danger, fontSize: 20, cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
                {(cat.variantes || []).map((v, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <input value={v.nombre} placeholder="ej: Estándar" onChange={e => { const n = [...localCats]; n[i].variantes[j] = { ...v, nombre: e.target.value }; setLocalCats(n); }} style={{ ...inputStyle, flex: 1 }} />
                    <span style={{ color: C.inkLight, fontSize: 13 }}>$</span>
                    <input type="number" value={v.precio || ""} placeholder="Precio" onChange={e => { const n = [...localCats]; n[i].variantes[j] = { ...v, precio: e.target.value ? parseInt(e.target.value) : null }; setLocalCats(n); }} style={{ ...inputStyle, width: 110, textAlign: "right" }} />
                    <button onClick={() => { const n = [...localCats]; n[i].variantes = n[i].variantes.filter((_, k) => k !== j); setLocalCats(n); }} style={{ background: "none", border: "none", color: C.danger, fontSize: 16, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
                <button onClick={() => { const n = [...localCats]; if (!n[i].variantes) n[i].variantes = []; n[i].variantes.push({ nombre: "", precio: null }); setLocalCats(n); }} style={{ fontSize: 12, color: C.inkLight, background: "none", border: `1px dashed ${C.border}`, borderRadius: 6, padding: "4px 1

