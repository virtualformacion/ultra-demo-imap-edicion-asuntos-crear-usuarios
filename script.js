// ========== USUARIOS AUTORIZADOS ==========
const USERS = [
    { username: "gocu", password: "0145", expiresAt: new Date("2027-11-23"), emails: ["tarah@gmail.com","licos@gmail.com"] },
    { username: "luis", password: "0000", expiresAt: new Date("2026-11-28"), emails: [] }
];

const MAX_ATTEMPTS = 1000000;
const BLOCK_HOURS = 24;

// ========== LOGIN ==========
document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    const message = document.getElementById("loginMessage");
    const user = USERS.find(u => u.username === username);
    const storageKey = `login_${username}`;
    const loginData = JSON.parse(localStorage.getItem(storageKey)) || {
        attempts: 0,
        blockedUntil: null
    };

    const now = new Date();

    // Si está bloqueado
    if (loginData.blockedUntil && now < new Date(loginData.blockedUntil)) {
        message.textContent = "Has escrito datos incorrectos muchas veces. Vuelve a intentarlo en 24 horas.";
        return;
    }

    // Validar usuario
    if (!user || user.password !== password) {
        loginData.attempts += 1;
        if (loginData.attempts >= MAX_ATTEMPTS) {
            loginData.blockedUntil = new Date(now.getTime() + BLOCK_HOURS * 60 * 60 * 1000).toISOString();
            message.textContent = "Has escrito datos incorrectos 3 veces. Vuelve a intentarlo en 24 horas.";
        } else {
            message.textContent = "Datos incorrectos. Vuelve a intentarlo.";
        }
        localStorage.setItem(storageKey, JSON.stringify(loginData));
        return;
    }

    // Validar expiración
    if (now > new Date(user.expiresAt)) {
        message.textContent = "Tu cuenta ha vencido, ponte en contacto con tu proveedor àra renovar tu cuenta.";
        return;
    }

    // Acceso autorizado
    localStorage.removeItem(storageKey);
    // Guardar el usuario logueado (para validar correos permitidos)
    localStorage.setItem("loggedUser", username);
    document.getElementById("loginContainer").style.display = "none";
    document.querySelector(".container").style.display = "block";
});

document.getElementById("emailForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    var email = document.getElementById("email").value;

    // ====== VALIDACIÓN DE CORREOS POR USUARIO ======
    // Si el usuario tiene emails definidos, solo puede consultar esos.
    // Si emails está vacío, se permite cualquier correo.
    const loggedUser = localStorage.getItem("loggedUser");
    if (loggedUser) {
        const u = USERS.find(x => x.username === loggedUser);
        const allowed = Array.isArray(u?.emails) ? u.emails : [];
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const allowedNormalized = allowed.map(a => String(a).trim().toLowerCase()).filter(Boolean);
        if (allowedNormalized.length > 0 && !allowedNormalized.includes(normalizedEmail)) {
            alert("Consulta con tu proveedor acerca de este correo que deseas obtener codigos");
            return;
        }
    }
    // ===============================================

    // Crear el mensaje de espera
    const loadingMessage = document.createElement("div");
    loadingMessage.textContent = "Espere unos segundos por favor. Consulta en proceso.";
    loadingMessage.style.position = "fixed";
    loadingMessage.style.top = "50%";
    loadingMessage.style.left = "50%";
    loadingMessage.style.transform = "translate(-50%, -50%)";
    loadingMessage.style.padding = "10px 20px";
    loadingMessage.style.backgroundColor = "#000000";
    loadingMessage.style.border = "1px solid #ccc";
    loadingMessage.style.borderRadius = "5px";
    loadingMessage.style.fontSize = "16px";
    loadingMessage.style.zIndex = "1000";
    loadingMessage.style.display = "block";
    
    // Añadir el mensaje al body
    document.body.appendChild(loadingMessage);

    try {
        const response = await fetch("/api/getLastEmail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        
        // Ocultar el mensaje de espera
        loadingMessage.style.display = "none";

        // Si encontramos un enlace de Disney+
        if (data.alert) {
            // Mostrar el cuerpo del mensaje de Disney+ en el modal
            document.getElementById("messageBody").innerHTML = data.body; // Insertar el HTML del cuerpo
            document.getElementById("messageModal").style.display = 'block'; // Mostrar el modal
        } 
        // Si encontramos un enlace de Netflix
        else if (data.link) {
            window.location.href = data.link; // Redirige automáticamente
        } 
        // Si no se encuentra nada
        else {
            alert(data.error || data.message || "No se encontró resultado para tu cuenta, vuelve a intentarlo nuevamente.");
        }
    } catch (error) {
        // Ocultar el mensaje de espera en caso de error
        loadingMessage.style.display = "none";
        
        alert("Ocurrió un error al procesar la solicitud. Por favor, inténtalo de nuevo.");
    }
});

// Función para cerrar el modal
document.getElementById("closeModal").addEventListener("click", function() {
    document.getElementById("messageModal").style.display = 'none'; // Ocultar el modal
});
