import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── FIREBASE CONFIG ────────────────────────────────────────────────────────
// Reemplazá esto con tu firebaseConfig real cuando lo tengas
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAEvubBsurEQrK-xgKhx5X74n_qJWHMdB0",
  authDomain: "feria-ropa-d5cf7.firebaseapp.com",
  projectId: "feria-ropa-d5cf7",
  storageBucket: "feria-ropa-d5cf7.firebasestorage.app",
  messagingSenderId: "794936729041",
  appId: "1:794936729041:web:bf274e0ff7aeeaa9d314f0",
};

// ─── DEFAULT DATA ────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "jeans",     nombre: "Jeans",      precio: 20000 },
  { id: "pantalon",  nombre: "Pantalón",   precio: 20000 },
  { id: "short",     nombre: "Short",      precio: 12000 },
  { id: "remera",    nombre: "Remera",     precio: 8000  },
  { id: "top",       nombre: "Top",        precio: 8000  },
  { id: "sweater",   nombre: "Sweater",    precio: 15000 },
  { id: "buzo",      nombre: "Buzo",       precio: 15000 },
  { id: "bikini",    nombre: "Bikini",     precio: 12000 },
  { id: "abrigo",    nombre: "Abrigo",     precio: 25000 },
  { id: "vestido",   nombre: "Vestido",    precio: 18000 },
  { id: "zapatilla", nombre: "Zapatilla",  precio: 22000 },
  { id: "bota",      nombre: "Bota",       precio: 25000 },
  { id: "especial",  nombre: "Especial ✨", precio: null  },
];

const DEFAULT_DESCUENTOS = [
  { cantidad: 2, porcentaje: 10 },
  { cantidad: 3, porcentaje: 15 },
  { cantidad: 4, porcentaje: 20 },
  { cantidad: 5, porcentaje: 25 },
];

// ─── PALETTE ────────────────────────────────────────────────────────────────
const C = {
  bg:       "#FBF7F2",
  surface:  "#FFFFFF",
  border:   "#E8E0D5",
  ink:      "#2C2416",
  inkLight: "#7A6E62",
  vanessa:  "#D4845A",  // terracota
  mariana:  "#5A8FA3",  // azul sereno
  accent:   "#C9B89A",
  success:  "#5A9E72",
  danger:   "#C0392B",
  tag:      "#F0EAE1",
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n) => n != null ? `$${Math.round(n).toLocaleString("es-AR")}` : "—";

function colorFor(duena) {
  return duena === "Vanessa" ? C.vanessa : C.mariana;
}

function calcularDescuento(cantPrendas, tablaDescuentos) {
  const sorted = [...tablaDescuentos].sort((a, b) => b.cantidad - a.cantidad);
  for (const row of sorted) {
    if (cantPrendas >= row.cantidad) return row.porcentaje;
  }
  return 0;
}

function prorratear(items, precioFinal) {
  const totalOriginal = items.reduce((s, i) => s + i.precio, 0);
  if (totalOriginal === 0) return items.map(i => ({ ...i, precioFinal: 0 }));
  return items.map(i => ({
    ...i,
    precioFinal: Math.round((i.precio / totalOriginal) * precioFinal),
  }));
}

// ─── QR SCANNER (jsQR via script tag) ────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;
    const script = document.getElementById("jsqr-script") || (() => {
      const s = document.createElement("script");
      s.id = "jsqr-script";
      s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      document.head.appendChild(s);
      return s;
    })();

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (e) {
        console.error("Camera error", e);
      }
    };

    const tick = () => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          onScan(code.data);
          return;
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };

    script.onload = () => { if (active) animRef.current = requestAnimationFrame(tick); };
    if (window.jsQR) animRef.current = requestAnimationFrame(tick);
    startCamera();

    return () => {
      active = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 1000,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
    }}>
      <video ref={videoRef} style={{ width: "100%", maxWidth: 480 }} playsInline muted />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 220, height: 220,
        border: `3px solid ${C.vanessa}`,
        borderRadius: 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)"
      }} />
      <button onClick={onClose} style={{
        position: "absolute", top: 24, right: 24,
        background: "rgba(255,255,255,0.15)", border: "none",
        color: "#fff", fontSize: 28, width: 44, height: 44,
        borderRadius: "50%", cursor: "pointer"
      }}>✕</button>
      <p style={{ color: "#fff", marginTop: 24, fontSize: 14 }}>Apuntá la cámara al QR de la etiqueta</p>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FeriaApp() {
  const [db, setDb] = useState(null);
  const [firebaseOk, setFirebaseOk] = useState(false);

  // Login
  const [usuario, setUsuario] = useState(() => localStorage.getItem("feria_usuario") || null);

  // Config (leída de Firebase o defaults)
  const [categorias, setCategorias] = useState(DEFAULT_CATEGORIES);
  const [descuentos, setDescuentos] = useState(DEFAULT_DESCUENTOS);

  // Carrito
  const [carrito, setCarrito] = useState([]);
  const [precioEditado, setPrecioEditado] = useState(null);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [scanning, setScanning] = useState(false);
  const [ventaConfirmada, setVentaConfirmada] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDuena, setManualDuena] = useState("Vanessa");
  const [manualCat, setManualCat] = useState("");
  const [manualPrecio, setManualPrecio] = useState("");

  // Ventas del día
  const [ventas, setVentas] = useState([]);

  // Admin
  const [adminTab, setAdminTab] = useState("categorias");
  const [editCat, setEditCat] = useState(null);
  const [editDesc, setEditDesc] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ── Firebase init ──
  useEffect(() => {
    if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR") {
      // Modo demo sin Firebase
      return;
    }
    try {
      const app = initializeApp(FIREBASE_CONFIG);
      const firestore = getFirestore(app);
      setDb(firestore);
      setFirebaseOk(true);
    } catch (e) {
      console.error("Firebase init error", e);
    }
  }, []);

  // ── Load config from Firebase ──
  useEffect(() => {
    if (!db) return;
    const loadConfig = async () => {
      const catDoc = await getDoc(doc(db, "config", "categorias"));
      if (catDoc.exists()) setCategorias(catDoc.data().items);
      const descDoc = await getDoc(doc(db, "config", "descuentos"));
      if (descDoc.exists()) setDescuentos(descDoc.data().items);
    };
    loadConfig();
  }, [db]);

  // ── Listen ventas en tiempo real ──
  useEffect(() => {
    if (!db) return;
    const today = new Date().toISOString().split("T")[0];
    const q = query(collection(db, "ventas"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, snap => {
      setVentas(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.fecha === today));
    });
    return unsub;
  }, [db]);

  // ── QR parse ──
  // Formato QR esperado: DUENA|CATEGORIA|PRECIO  ej: Vanessa|jeans|20000 o Vanessa|especial|
  const handleScan = useCallback((data) => {
    setScanning(false);
    const parts = data.split("|");
    if (parts.length < 2) { showToast("QR inválido", "err"); return; }
    const [duena, catId, precioStr] = parts;
    const cat = categorias.find(c => c.id === catId);
    if (!cat) { showToast("Categoría no encontrada", "err"); return; }
    const precio = precioStr ? parseInt(precioStr) : cat.precio;
    if (!precio) { showToast("Esta prenda es 'Especial' — ingresá el precio manualmente", "warn"); return; }
    agregarAlCarrito(duena, cat, precio);
  }, [categorias]);

  const agregarAlCarrito = (duena, cat, precio) => {
    setCarrito(prev => [...prev, {
      id: Date.now() + Math.random(),
      duena,
      categoria: cat.nombre,
      precio,
    }]);
    setPrecioEditado(null);
    showToast(`${cat.nombre} de ${duena} agregado`);
  };

  // ── Cálculos carrito ──
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
    if (db) {
      await addDoc(collection(db, "ventas"), venta);
    } else {
      setVentas(prev => [{ id: Date.now(), ...venta }, ...prev]);
    }
    setVentaConfirmada(venta);
    setCarrito([]);
    setPrecioEditado(null);
  };

  // ── Resumen del día ──
  const resumenDia = () => {
    const por = { Vanessa: 0, Mariana: 0 };
    for (const v of ventas) {
      for (const [duena, monto] of Object.entries(v.porDuena || {})) {
        if (por[duena] !== undefined) por[duena] += monto;
      }
    }
    return por;
  };

  // ── Guardar config admin ──
  const guardarCategorias = async (nuevas) => {
    setCategorias(nuevas);
    if (db) await setDoc(doc(db, "config", "categorias"), { items: nuevas });
    showToast("Categorías guardadas");
  };
  const guardarDescuentos = async (nuevos) => {
    setDescuentos(nuevos);
    if (db) await setDoc(doc(db, "config", "descuentos"), { items: nuevos });
    showToast("Descuentos guardados");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: LOGIN
  // ─────────────────────────────────────────────────────────────────────────
  if (!usuario) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', sans-serif", padding: 24
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>👗</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>
          Feria de ropa
        </h1>
        <p style={{ color: C.inkLight, marginBottom: 40, fontSize: 14 }}>
          ¿Quién sos?
        </p>
        {["Vanessa", "Mariana"].map(name => (
          <button key={name} onClick={() => {
            setUsuario(name);
            localStorage.setItem("feria_usuario", name);
          }} style={{
            width: 240, padding: "16px 0", marginBottom: 16,
            background: colorFor(name), color: "#fff",
            border: "none", borderRadius: 14, fontSize: 18,
            fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            {name}
          </button>
        ))}
        {!firebaseOk && FIREBASE_CONFIG.apiKey === "REEMPLAZAR" && (
          <p style={{ fontSize: 12, color: C.inkLight, marginTop: 32, textAlign: "center" }}>
            Modo demo (sin Firebase) — los datos no se guardan entre sesiones
          </p>
        )}
      </div>
    );
  }

  const isAdmin = usuario === "Mariana";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: CONFIRMACIÓN DE VENTA
  // ─────────────────────────────────────────────────────────────────────────
  if (ventaConfirmada) {
    return (
      <Screen title="✅ Venta registrada">
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <p style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>
            {fmt(ventaConfirmada.totalFinal)}
          </p>
          <p style={{ color: C.inkLight, marginBottom: 24 }}>
            {ventaConfirmada.metodo} · {ventaConfirmada.items.length} prenda{ventaConfirmada.items.length !== 1 ? "s" : ""}
          </p>
          {Object.entries(ventaConfirmada.porDuena).map(([d, m]) => (
            <div key={d} style={{
              background: C.tag, borderRadius: 10, padding: "10px 16px",
              marginBottom: 8, display: "flex", justifyContent: "space-between"
            }}>
              <span style={{ color: colorFor(d), fontWeight: 600 }}>{d}</span>
              <span style={{ fontWeight: 700 }}>{fmt(m)}</span>
            </div>
          ))}
          <Btn onClick={() => setVentaConfirmada(null)} style={{ marginTop: 24 }}>
            Nueva venta
          </Btn>
        </div>
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: TABS
  // ─────────────────────────────────────────────────────────────────────────
  const tabs = isAdmin
    ? ["Cobro", "Resumen", "Admin"]
    : ["Cobro", "Resumen"];

  const [tab, setTab] = useState("Cobro");

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'Inter', sans-serif",
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column"
    }}>
      {/* Header */}
      <div style={{
        background: colorFor(usuario), color: "#fff",
        padding: "14px 20px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1 }}>FERIA DE ROPA</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{usuario}</div>
        </div>
        <button onClick={() => {
          setUsuario(null);
          localStorage.removeItem("feria_usuario");
        }} style={{
          background: "rgba(255,255,255,0.2)", border: "none",
          color: "#fff", borderRadius: 8, padding: "4px 10px",
          fontSize: 12, cursor: "pointer"
        }}>Cambiar</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "12px 0", border: "none",
            background: "none", fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? colorFor(usuario) : C.inkLight,
            borderBottom: tab === t ? `2px solid ${colorFor(usuario)}` : "2px solid transparent",
            cursor: "pointer"
          }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {tab === "Cobro" && (
          <TabCobro
            carrito={carrito}
            setCarrito={setCarrito}
            categorias={categorias}
            totalOriginal={totalOriginal}
            pctAuto={pctAuto}
            totalConDescAuto={totalConDescAuto}
            precioFinal={precioFinal}
            precioEditado={precioEditado}
            setPrecioEditado={setPrecioEditado}
            pctReal={pctReal}
            descuentoTotal={descuentoTotal}
            itemsProrateados={itemsProrateados}
            resumenCarrito={resumenCarrito}
            metodoPago={metodoPago}
            setMetodoPago={setMetodoPago}
            registrarVenta={registrarVenta}
            setScanning={setScanning}
            manualMode={manualMode}
            setManualMode={setManualMode}
            manualDuena={manualDuena}
            setManualDuena={setManualDuena}
            manualCat={manualCat}
            setManualCat={setManualCat}
            manualPrecio={manualPrecio}
            setManualPrecio={setManualPrecio}
            agregarAlCarrito={agregarAlCarrito}
            colorFor={colorFor}
          />
        )}
        {tab === "Resumen" && (
          <TabResumen ventas={ventas} resumenDia={resumenDia} colorFor={colorFor} />
        )}
        {tab === "Admin" && isAdmin && (
          <TabAdmin
            adminTab={adminTab}
            setAdminTab={setAdminTab}
            categorias={categorias}
            descuentos={descuentos}
            guardarCategorias={guardarCategorias}
            guardarDescuentos={guardarDescuentos}
            editCat={editCat}
            setEditCat={setEditCat}
            editDesc={editDesc}
            setEditDesc={setEditDesc}
            colorFor={colorFor}
          />
        )}
      </div>

      {/* Scanner */}
      {scanning && <QRScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%",
          transform: "translateX(-50%)",
          background: toast.type === "err" ? C.danger : toast.type === "warn" ? "#E67E22" : C.success,
          color: "#fff", padding: "10px 20px", borderRadius: 20,
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: COBRO
// ─────────────────────────────────────────────────────────────────────────────
function TabCobro({
  carrito, setCarrito, categorias,
  totalOriginal, pctAuto, totalConDescAuto,
  precioFinal, precioEditado, setPrecioEditado,
  pctReal, descuentoTotal,
  itemsProrateados, resumenCarrito,
  metodoPago, setMetodoPago,
  registrarVenta,
  setScanning,
  manualMode, setManualMode,
  manualDuena, setManualDuena,
  manualCat, setManualCat,
  manualPrecio, setManualPrecio,
  agregarAlCarrito, colorFor
}) {
  const catSeleccionada = categorias.find(c => c.id === manualCat);

  const agregarManual = () => {
    if (!catSeleccionada) return;
    const precio = catSeleccionada.precio || (manualPrecio ? parseInt(manualPrecio) : null);
    if (!precio) return;
    agregarAlCarrito(manualDuena, catSeleccionada, precio);
    setManualMode(false);
    setManualCat("");
    setManualPrecio("");
  };

  return (
    <div>
      {/* Botones de acción */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <Btn onClick={() => setScanning(true)} style={{ flex: 1, background: C.ink }}>
          📷 Escanear QR
        </Btn>
        <Btn onClick={() => setManualMode(m => !m)} style={{
          flex: 1,
          background: manualMode ? C.accent : C.surface,
          color: manualMode ? "#fff" : C.ink,
          border: `1px solid ${C.border}`
        }}>
          ✏️ Manual
        </Btn>
      </div>

      {/* Modo manual */}
      {manualMode && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Agregar prenda manualmente</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {["Vanessa", "Mariana"].map(d => (
              <button key={d} onClick={() => setManualDuena(d)} style={{
                flex: 1, padding: "8px 0",
                background: manualDuena === d ? colorFor(d) : C.tag,
                color: manualDuena === d ? "#fff" : C.ink,
                border: "none", borderRadius: 8, fontWeight: 600,
                fontSize: 13, cursor: "pointer"
              }}>{d}</button>
            ))}
          </div>
          <select value={manualCat} onChange={e => setManualCat(e.target.value)} style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.bg,
            fontSize: 14, marginBottom: 10
          }}>
            <option value="">Seleccioná categoría...</option>
            {categorias.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.precio ? `— ${fmt(c.precio)}` : "— precio especial"}
              </option>
            ))}
          </select>
          {catSeleccionada && !catSeleccionada.precio && (
            <input
              type="number" placeholder="Precio especial"
              value={manualPrecio}
              onChange={e => setManualPrecio(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg,
                fontSize: 14, marginBottom: 10, boxSizing: "border-box"
              }}
            />
          )}
          <Btn onClick={agregarManual} style={{ width: "100%" }}>
            Agregar al carrito
          </Btn>
        </Card>
      )}

      {/* Carrito */}
      {carrito.length > 0 ? (
        <>
          <div style={{ marginBottom: 12 }}>
            {carrito.map((item, i) => (
              <div key={item.id} style={{
                background: C.surface, borderRadius: 10, padding: "10px 14px",
                marginBottom: 8, display: "flex", alignItems: "center",
                border: `1px solid ${C.border}`
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: colorFor(item.duena), marginRight: 10, flexShrink: 0
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.categoria}</div>
                  <div style={{ fontSize: 12, color: colorFor(item.duena) }}>{item.duena}</div>
                </div>
                <div style={{ fontWeight: 700, marginRight: 10 }}>{fmt(item.precio)}</div>
                <button onClick={() => setCarrito(c => c.filter(x => x.id !== item.id))} style={{
                  background: "none", border: "none", color: C.danger,
                  fontSize: 18, cursor: "pointer", padding: "0 4px"
                }}>✕</button>
              </div>
            ))}
          </div>

          {/* Total */}
          <Card style={{ marginBottom: 16 }}>
            <Row label="Subtotal" value={fmt(totalOriginal)} />
            {pctAuto > 0 && (
              <Row label={`Descuento ${carrito.length} prendas (${pctAuto}%)`} value={`−${fmt(totalOriginal - totalConDescAuto)}`} muted />
            )}
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />

            {/* Precio final editable */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: C.inkLight, flex: 1 }}>Precio final</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.inkLight, fontSize: 14 }}>$</span>
                <input
                  type="number"
                  value={precioEditado !== null ? precioEditado : totalConDescAuto}
                  onChange={e => setPrecioEditado(Number(e.target.value))}
                  style={{
                    width: 110, padding: "6px 8px", borderRadius: 8,
                    border: `2px solid ${C.ink}`, fontSize: 18,
                    fontWeight: 700, textAlign: "right"
                  }}
                />
              </div>
            </div>
            {precioEditado !== null && precioEditado !== totalConDescAuto && (
              <p style={{ fontSize: 11, color: C.inkLight, margin: "4px 0 0", textAlign: "right" }}>
                Descuento total: {pctReal}% (−{fmt(descuentoTotal)})
              </p>
            )}

            {/* Desglose por dueña */}
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 6 }}>Distribución</p>
              {Object.entries(resumenCarrito()).map(([d, m]) => (
                <Row key={d} label={d} value={fmt(m)} color={colorFor(d)} bold />
              ))}
            </div>
          </Card>

          {/* Método de pago */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["efectivo", "transferencia"].map(m => (
              <button key={m} onClick={() => setMetodoPago(m)} style={{
                flex: 1, padding: "10px 0",
                background: metodoPago === m ? C.ink : C.surface,
                color: metodoPago === m ? "#fff" : C.ink,
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontWeight: 600, fontSize: 13, cursor: "pointer",
                textTransform: "capitalize"
              }}>
                {m === "efectivo" ? "💵 Efectivo" : "📲 Transferencia"}
              </button>
            ))}
          </div>

          <Btn onClick={registrarVenta} style={{
            width: "100%", fontSize: 17, padding: "16px 0",
            background: C.success
          }}>
            Confirmar venta · {fmt(precioFinal)}
          </Btn>

          <button onClick={() => setCarrito([])} style={{
            width: "100%", marginTop: 10, padding: "10px 0",
            background: "none", border: "none",
            color: C.danger, fontSize: 13, cursor: "pointer"
          }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// TAB: RESUMEN
// ─────────────────────────────────────────────────────────────────────────────
function TabResumen({ ventas, resumenDia, colorFor }) {
  const res = resumenDia();
  const total = Object.values(res).reduce((s, v) => s + v, 0);

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 12, fontWeight: 600, letterSpacing: 1 }}>
          RESUMEN DEL DÍA
        </p>
        {Object.entries(res).map(([d, m]) => (
          <div key={d} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: colorFor(d) }}>{d}</span>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{fmt(m)}</span>
            </div>
            <div style={{ height: 6, background: C.tag, borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: total > 0 ? `${(m / total) * 100}%` : "0%",
                background: colorFor(d), borderRadius: 3,
                transition: "width 0.4s"
              }} />
            </div>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.inkLight }}>Total recaudado</span>
          <span style={{ fontWeight: 700, fontSize: 20 }}>{fmt(total)}</span>
        </div>
        <p style={{ fontSize: 12, color: C.inkLight, marginTop: 4 }}>
          {ventas.length} venta{ventas.length !== 1 ? "s" : ""} registrada{ventas.length !== 1 ? "s" : ""}
        </p>
      </Card>

      {ventas.map(v => (
        <Card key={v.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(v.totalFinal)}</span>
              {v.descuento > 0 && (
                <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 6 }}>
                  (−{fmt(v.descuento)})
                </span>
              )}
              <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>
                {v.metodo} · {v.vendedor} · {v.items?.length} prenda{v.items?.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {Object.entries(v.porDuena || {}).map(([d, m]) => (
                <div key={d} style={{ fontSize: 12, color: colorFor(d), fontWeight: 600 }}>
                  {d}: {fmt(m)}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ))}

      {ventas.length === 0 && (
        <p style={{ textAlign: "center", color: C.inkLight, padding: 40 }}>
          Todavía no hay ventas hoy.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: ADMIN
// ─────────────────────────────────────────────────────────────────────────────
function TabAdmin({
  adminTab, setAdminTab,
  categorias, descuentos,
  guardarCategorias, guardarDescuentos,
  editCat, setEditCat,
  editDesc, setEditDesc,
  colorFor
}) {
  const [localCats, setLocalCats] = useState(categorias);
  const [localDesc, setLocalDesc] = useState(descuentos);

  useEffect(() => setLocalCats(categorias), [categorias]);
  useEffect(() => setLocalDesc(descuentos), [descuentos]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["categorias", "descuentos"].map(t => (
          <button key={t} onClick={() => setAdminTab(t)} style={{
            flex: 1, padding: "10px 0",
            background: adminTab === t ? C.ink : C.surface,
            color: adminTab === t ? "#fff" : C.ink,
            border: `1px solid ${C.border}`, borderRadius: 10,
            fontWeight: 600, fontSize: 13, cursor: "pointer"
          }}>
            {t === "categorias" ? "Categorías y precios" : "Descuentos"}
          </button>
        ))}
      </div>

      {adminTab === "categorias" && (
        <>
          {localCats.map((cat, i) => (
            <Card key={cat.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={cat.nombre}
                  onChange={e => {
                    const n = [...localCats];
                    n[i] = { ...n[i], nombre: e.target.value };
                    setLocalCats(n);
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: C.inkLight, fontSize: 13 }}>$</span>
                <input
                  type="number"
                  placeholder="libre"
                  value={cat.precio || ""}
                  onChange={e => {
                    const n = [...localCats];
                    n[i] = { ...n[i], precio: e.target.value ? parseInt(e.target.value) : null };
                    setLocalCats(n);
                  }}
                  style={{ ...inputStyle, width: 100, textAlign: "right" }}
                />
              </div>
              <button onClick={() => setLocalCats(c => c.filter((_, j) => j !== i))} style={{
                background: "none", border: "none", color: C.danger,
                fontSize: 18, cursor: "pointer"
              }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalCats(c => [...c, { id: `cat_${Date.now()}`, nombre: "", precio: null }])}
            style={{ ...ghostBtnStyle, marginBottom: 12 }}>
            + Agregar categoría
          </button>
          <Btn onClick={() => guardarCategorias(localCats)} style={{ width: "100%" }}>
            Guardar categorías
          </Btn>
        </>
      )}

      {adminTab === "descuentos" && (
        <>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 12 }}>
            Descuento automático según cantidad de prendas
          </p>
          {localDesc.map((row, i) => (
            <Card key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: C.inkLight, flexShrink: 0 }}>Desde</span>
              <input
                type="number"
                value={row.cantidad}
                onChange={e => {
                  const n = [...localDesc];
                  n[i] = { ...n[i], cantidad: parseInt(e.target.value) };
                  setLocalDesc(n);
                }}
                style={{ ...inputStyle, width: 60, textAlign: "center" }}
              />
              <span style={{ fontSize: 13, color: C.inkLight, flexShrink: 0 }}>prendas →</span>
              <input
                type="number"
                value={row.porcentaje}
                onChange={e => {
                  const n = [...localDesc];
                  n[i] = { ...n[i], porcentaje: parseInt(e.target.value) };
                  setLocalDesc(n);
                }}
                style={{ ...inputStyle, width: 60, textAlign: "center" }}
              />
              <span style={{ fontSize: 13, color: C.inkLight }}>%</span>
              <button onClick={() => setLocalDesc(d => d.filter((_, j) => j !== i))} style={{
                background: "none", border: "none", color: C.danger,
                fontSize: 18, cursor: "pointer"
              }}>✕</button>
            </Card>
          ))}
          <button onClick={() => setLocalDesc(d => [...d, { cantidad: 0, porcentaje: 0 }])}
            style={{ ...ghostBtnStyle, marginBottom: 12 }}>
            + Agregar escala
          </button>
          <Btn onClick={() => guardarDescuentos(localDesc)} style={{ width: "100%" }}>
            Guardar descuentos
          </Btn>
        </>
      )}
    </div>
  );
}

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function Screen({ title, children }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'Inter', sans-serif",
      maxWidth: 480, margin: "0 auto", padding: 20
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{title}</h2>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 12, padding: "14px 16px",
      border: `1px solid ${C.border}`, ...style
    }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      padding: "12px 20px", background: C.ink, color: "#fff",
      border: "none", borderRadius: 12, fontSize: 15,
      fontWeight: 600, cursor: "pointer", ...style
    }}>
      {children}
    </button>
  );
}

function Row({ label, value, muted, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 14, color: muted ? C.inkLight : color || C.ink }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: bold ? 700 : 400,
        color: muted ? C.inkLight : color || C.ink
      }}>{value}</span>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg,
  fontSize: 14, width: "100%", boxSizing: "border-box"
};

const ghostBtnStyle = {
  width: "100%", padding: "10px 0",
  background: "none", border: `1px dashed ${C.border}`,
  borderRadius: 10, color: C.inkLight, fontSize: 13,
  cursor: "pointer"
};
