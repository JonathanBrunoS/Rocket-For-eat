// Importações do Firebase (ESM - Módulos)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut,
    signInWithCustomToken,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    getDocs,
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    collection, 
    query, 
    where,
    orderBy, // NOVO: Para ordenar pagamentos
    Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// **********************************************************
// ***** ATENÇÃO: INTEGRAÇÃO DA API DO GEMINI *****
// **********************************************************
// Para a Análise de IA funcionar, descomente a linha abaixo 
// e certifique-se de que a API Key está correta.
// import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
// **********************************************************

// --- VARIÁVEIS DE AMBIENTE (INJETADAS) ---
const appId = 'crm-rocket-data'; 

// --- CHAVES DO FIREBASE INSERIDAS DIRETAMENTE ---
const firebaseConfig = {
 apiKey: "AIzaSyCjOOO8BjKHSl_4a8yU9Y6ggyVsKvIdT00",
 authDomain: "crmrocket.firebaseapp.com",
 projectId: "crmrocket",
 storageBucket: "crmrocket.firebasestorage.app",
 messagingSenderId: "395158203315",
 appId: "1:395158203315:web:93adeda54e40734d1c39c6"
};

// --- INICIALIZAÇÃO DO FIREBASE ---
let app, auth, db;
try {
    if (!firebaseConfig.apiKey) {
        throw new Error("API Key do Firebase está faltando.");
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
    const authError = document.getElementById('authError');
    if(authError) {
        authError.textContent = `Erro ao inicializar Firebase: ${e.message}. Verifique as chaves no código.`;
        authError.classList.remove('hidden');
    } else {
         document.body.innerHTML = `<h1 style='text-align: center; margin-top: 50px;'>Erro de Configuração do Firebase: ${e.message}. Verifique o console.</h1>`;
    }
}

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let userId = null; 
let currentClientId = null; 
let currentProspectId = null; 
let currentDeleteInfo = null; 
let allClientsData = {}; 
let dashTotals = { bruto: 0, despesas: 0, recebido: 0 }; 

// --- FUNÇÕES DE UTILIDADE ---

const prospectServices = [
    "Cardápio 99Food", 
    "Cardápio iFood", 
    "Cardápio Próprio", 
    "Google Meu Negócio (GMN)", 
    "Otimização Instagram", 
    "Otimização de Cardápio"
];

const renderIcons = () => {
    if (typeof lucide !== 'undefined') {
        try {
            lucide.createIcons();
        } catch (e) { console.error("Erro ao renderizar ícones lucide:", e); }
    } else {
        console.warn("Lucide ainda não definido.");
    }
};

const formatCurrency = (value) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const getDaysRemaining = (dateStr) => {
    if (!dateStr) return 0;
    const today = new Date();
    const endDate = new Date(dateStr + "T23:59:59"); 
    const diffTime = endDate.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    // Trata data completa (ISO 2024-11-04T10:00:00) ou simples (YYYY-MM-DD)
    const cleanDateStr = dateStr.split('T')[0];
    const [year, month, day] = cleanDateStr.split('-');
    if (!year || !month || !day) return 'Data Inválida';
    return `${day}/${month}/${year}`;
};

// NOVO: Formata Data e Hora (para comentários)
const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Data Inválida';
    }
};

const getCurrentMonthRange = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
        start: firstDay.toISOString().split('T')[0],
        end: lastDay.toISOString().split('T')[0]
    };
};

const getLastMonthRange = () => {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    return {
        start: firstDay.toISOString().split('T')[0],
        end: lastDay.toISOString().split('T')[0]
    };
};

const getReportDateRange = (period) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start, end;
    
    end = new Date();
    end.setHours(23, 59, 59, 999); 

    switch(period) {
        case 'today':
            start = new Date(today);
            break;
        case 'last7':
            start = new Date(today);
            start.setDate(start.getDate() - 6); 
            break;
        case 'thisMonth':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'lastMonth':
            const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0); 
            start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
            end = lastMonth;
            break;
        case 'thisYear':
            start = new Date(today.getFullYear(), 0, 1); 
            break;
        case 'custom':
            const startDateEl = document.getElementById('reportStartDate');
            const endDateEl = document.getElementById('reportEndDate');
            if (startDateEl.value && endDateEl.value) {
                start = new Date(startDateEl.value + "T00:00:00");
                end = new Date(endDateEl.value + "T23:59:59");
            } else {
                return null; 
            }
            break;
        default:
            return getCurrentMonthRange(); 
    }
    
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
};

function renderServicesCheckboxes(containerId, savedServices = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    prospectServices.forEach(service => {
        const isChecked = savedServices.includes(service);
        container.innerHTML += `
            <label class="flex items-center text-sm text-gray-700">
                <input type="checkbox" value="${service}" ${isChecked ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-rocket-yellow-400 focus:ring-rocket-yellow-300">
                <span class="ml-2">${service}</span>
            </label>
        `;
    });
}

function getSelectedServices(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}


const showPage = (pageId) => {
    document.querySelectorAll('.page-content, #auth-page, #app-page').forEach(page => {
        page.classList.remove('active');
    });

    const mainElement = document.querySelector('main');
    mainElement.classList.add('overflow-y-auto');
    mainElement.classList.remove('overflow-hidden'); 

    if (pageId === 'auth-page') {
        document.getElementById('auth-page').classList.add('active');
    } else {
        document.getElementById('app-page').classList.add('active');
        if (document.getElementById(pageId)) {
            document.getElementById(pageId).classList.add('active');
        } else {
            document.getElementById('dashboardPage').classList.add('active'); 
        }
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active-nav', link.dataset.page === pageId);
    });
    
    document.getElementById('mobileMenu').classList.add('hidden');
    
    switch(pageId) {
        case 'dashboardPage': loadDashboardData(); break;
        case 'prospectsPage': loadProspects(); break;
        case 'clientsPage': loadClientsList(); break;
        case 'receivablesPage': loadReceivablesReport(); break; 
        case 'expensesPage': loadExpensesPage(); break; 
        case 'globalTasksPage': loadGlobalTasks(); break; 
        case 'reportsPage':
            loadHistoricalReport();
            loadClientRevenueReport(); 
            break; 
        case 'companyPage': loadCompanyGoalsPage(); break;
    }
};

const showModal = (modalId) => {
    document.getElementById(modalId)?.classList.add('active');
};

const hideModal = (modalId) => {
    document.getElementById(modalId)?.classList.remove('active');
};

const switchTab = (tabName, tabContainerClass, contentContainerClass) => {
    document.querySelectorAll(contentContainerClass).forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
    document.querySelectorAll(tabContainerClass).forEach(link => {
        const isTarget = link.dataset.tab === tabName;
        link.classList.toggle('active-tab', isTarget);
        // Ajuste para as classes específicas de cada tipo de tab
        if (tabContainerClass === '.tab-link') { 
            link.classList.toggle('border-rocket-yellow-400', isTarget);
            link.classList.toggle('text-rocket-yellow-500', isTarget);
            link.classList.toggle('border-transparent', !isTarget);
            link.classList.toggle('text-gray-500', !isTarget);
        }
        if (tabContainerClass === '.finance-tab-link') {
            link.classList.toggle('border-rocket-yellow-400', isTarget);
            link.classList.toggle('text-rocket-yellow-500', isTarget);
            link.classList.toggle('border-transparent', !isTarget);
            link.classList.toggle('text-gray-500', !isTarget);
        }
    });
};

// Trata erros amigáveis
const handleFriendlyError = (title, message, error) => {
    console.error(title, error || message); 
    const authPage = document.getElementById('auth-page');
    const authError = document.getElementById('authError');

    if (message.includes("Missing or insufficient permissions")) {
         title = "Erro de Permissão do Banco de Dados.";
         message = "As suas 'Regras' do Firestore estão a bloquear a app. Por favor, vá a 'Cloud Firestore' > 'Regras', cole o texto abaixo e clique em 'Publicar':\n\n<pre class='text-left text-xs bg-gray-800 p-2 rounded'>rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /artifacts/crm-rocket-data/public/data/{collection}/{docId} {\n      allow read, write: if request.auth != null;\n    }\n    match /artifacts/crm-rocket-data/users/{userId}/{document=**} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}</pre>";
    }
    else if (message.includes("offline") || message.includes("Failed to get document")) {
         title = "Erro de Banco de Dados: Client Offline.";
         message = "Isto geralmente significa que o 'Cloud Firestore' não foi ativado no seu projeto Firebase. Por favor, vá ao painel do Firebase, clique em 'Cloud Firestore', 'Criar banco de dados' e escolha 'Modo de Teste'.";
    }
    else if (message.includes("auth/configuration-not-found")) {
         title = "Falha no Login: Configuração não encontrada.";
         message = "Isto significa que ativou a 'Autenticação' no Firebase, mas esqueceu-se de ativar o provedor 'Anónimo'. Por favor, vá a 'Authentication' > 'Método de Login' > 'Adicionar provedor' e ative 'Anónimo'.";
    }


    if (authPage && authError) {
        authError.innerHTML = `
            <strong class="text-lg">${title}</strong><br>
            <span class="text-sm">${message}</span>
        `;
        authError.classList.remove('hidden');
        authError.classList.add('text-left', 'bg-red-900', 'p-4', 'rounded-md');
        showPage('auth-page'); 
    }
};

// --- AUTENTICAÇÃO ---

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid; 
            initEventListeners(); 
            await loadAllClientsToCache();
            showPage('dashboardPage'); 
        } else {
            userId = null;
            autoLogin();
        }
    }, (error) => {
        handleFriendlyError("Erro na Autenticação", error.message, error);
    });
}

const autoLogin = async () => {
     if (!auth) {
         console.error("Autenticação do Firebase não inicializada.");
         return;
     }
     try {
         await signInAnonymously(auth);
     } catch (error) {
         console.error("Falha no login automático: ", error);
         handleFriendlyError("Falha no login automático", error.message, error);
     }
};

// --- METAS (Definição) ---

const goalsDocRef = () => doc(db, `/artifacts/${appId}/public/data/company/goals`);

const loadCompanyGoalsData = async () => {
    if (!userId || !db) return;

    let metaFaturamento = 0;
    let metaProspeccao = 0;
    try {
        const docSnap = await getDoc(goalsDocRef());
        if (docSnap.exists()) {
            const goals = docSnap.data();
            metaFaturamento = goals.faturamento || 0;
            metaProspeccao = goals.prospeccao || 0;
        }
    } catch (e) { 
        handleFriendlyError("Erro ao carregar metas", e.message, e);
        return; 
    }

    try {
        const { start } = getCurrentMonthRange();
        
        const salesQuery = query(collection(db, `/artifacts/${appId}/public/data/sales`), where("data", ">=", start));
        let faturamentoAtual = 0;
        const salesSnapshot = await getDocs(salesQuery);
        salesSnapshot.forEach(doc => {
            faturamentoAtual += doc.data().valor || 0;
        });
        
        const prospectsQuery = query(collection(db, `/artifacts/${appId}/public/data/prospects`), where("createdAt", ">=", start));
        let novosLeads = 0;
        const prospectsSnapshot = await getDocs(prospectsQuery);
        novosLeads = prospectsSnapshot.size; 

        // Atualiza UI (Página Minha Empresa)
        const fLabel = document.getElementById('faturamento-label');
        const fProgress = document.getElementById('faturamento-progress');
        const pLabel = document.getElementById('prospeccao-label');
        const pProgress = document.getElementById('prospeccao-progress');

        if (fLabel && fProgress && pLabel && pProgress) {
            const fPercent = metaFaturamento > 0 ? (faturamentoAtual / metaFaturamento) * 100 : 0;
            fLabel.textContent = `${formatCurrency(faturamentoAtual)} / ${formatCurrency(metaFaturamento)}`;
            fProgress.style.width = `${Math.min(fPercent, 100)}%`;
            
            const pPercent = metaProspeccao > 0 ? (novosLeads / metaProspeccao) * 100 : 0;
            pLabel.textContent = `${novosLeads} / ${metaProspeccao}`;
            pProgress.style.width = `${Math.min(pPercent, 100)}%`;
        }

        // Atualiza UI (Dashboard)
        const fLabelDash = document.getElementById('faturamento-label-dash');
        const fProgressDash = document.getElementById('faturamento-progress-dash');
        const pLabelDash = document.getElementById('prospeccao-label-dash');
        const pProgressDash = document.getElementById('prospeccao-progress-dash');

        if (fLabelDash && fProgressDash && pLabelDash && pProgressDash) {
            const fPercent = metaFaturamento > 0 ? (faturamentoAtual / metaFaturamento) * 100 : 0;
            fLabelDash.textContent = `${formatCurrency(faturamentoAtual)} / ${formatCurrency(metaFaturamento)}`;
            fProgressDash.style.width = `${Math.min(fPercent, 100)}%`;
            
            const pPercent = metaProspeccao > 0 ? (novosLeads / metaProspeccao) * 100 : 0;
            pLabelDash.textContent = `${novosLeads} / ${metaProspeccao}`;
            pProgressDash.style.width = `${Math.min(pPercent, 100)}%`;
        }
    } catch (e) {
        handleFriendlyError("Erro ao carregar dados de vendas/prospects", e.message, e);
    }
};

const loadCompanyGoalsPage = async () => {
    if (!userId) return;
    try {
        const docSnap = await getDoc(goalsDocRef());
        if (docSnap.exists()) {
            const goals = docSnap.data();
            document.getElementById('goal-faturamento').value = goals.faturamento || 0;
            document.getElementById('goal-prospeccao').value = goals.prospeccao || 0;
        }
    } catch (e) { 
        handleFriendlyError("Erro ao carregar página de metas", e.message, e);
    }
    loadCompanyGoalsData();
};


// --- DASHBOARD ---

const loadDashboardData = () => {
    if (!userId || !db) return;

    const { start } = getCurrentMonthRange();

    const clientsQuery = query(collection(db, `/artifacts/${appId}/public/data/clients`), where("status", "==", "Ativo"));
    onSnapshot(clientsQuery, (snapshot) => {
        let ativos = 0;
        snapshot.forEach(doc => { ativos++; });
        const kpiAtivosEl = document.getElementById('kpi-ativos');
        if (kpiAtivosEl) { kpiAtivosEl.textContent = ativos; }
    }, (e) => { handleFriendlyError("Erro no Dashboard (Clientes)", e.message, e); });

    const salesQuery = query(collection(db, `/artifacts/${appId}/public/data/sales`), where("data", ">=", start));
    onSnapshot(salesQuery, (snapshot) => {
        let faturamentoTotalMes = 0;
        snapshot.forEach(doc => {
            faturamentoTotalMes += doc.data().valor || 0;
        });
        dashTotals.bruto = faturamentoTotalMes;
        const kpiBrutoEl = document.getElementById('kpi-faturamento-bruto');
        if (kpiBrutoEl) { kpiBrutoEl.textContent = formatCurrency(faturamentoTotalMes); }
    }, (e) => { handleFriendlyError("Erro no Dashboard (Vendas)", e.message, e); });
    
    const expensesQuery = query(collection(db, `/artifacts/${appId}/public/data/expenses`), where("data", ">=", start));
    onSnapshot(expensesQuery, (snapshot) => {
        let totalExpenses = 0;
        snapshot.forEach(doc => { totalExpenses += doc.data().valor || 0; });
        dashTotals.despesas = totalExpenses;
        const kpiDespesasEl = document.getElementById('kpi-despesas');
        if (kpiDespesasEl) { kpiDespesasEl.textContent = formatCurrency(totalExpenses); }
        calculateNetRevenue();
    }, (e) => { handleFriendlyError("Erro no Dashboard (Despesas)", e.message, e); });
    
    const paidPaymentsQuery = query(collection(db, `/artifacts/${appId}/public/data/payments`), 
        where("status", "==", "Pago")
    );
    onSnapshot(paidPaymentsQuery, (snapshot) => {
        let totalRecebido = 0;
        const { start: currentMonthStart } = getCurrentMonthRange(); 
        const currentMonth = new Date(currentMonthStart + "T12:00:00").getMonth();
        const currentYear = new Date(currentMonthStart + "T12:00:00").getFullYear();

        snapshot.forEach(doc => {
            const payment = doc.data();
            const paymentDate = new Date(payment.dataVencimento + "T12:00:00");
            if (paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear) {
                totalRecebido += payment.valor || 0;
            }
        });
        dashTotals.recebido = totalRecebido;
        calculateNetRevenue();
    }, (e) => { handleFriendlyError("Erro no Dashboard (Recebidos)", e.message, e); });

    
    const calculateNetRevenue = () => {
        try {
            const liquidoEl = document.getElementById('kpi-faturamento-liquido');
            if (liquidoEl) { 
                const liquido = dashTotals.recebido - dashTotals.despesas;
                liquidoEl.textContent = formatCurrency(liquido);
            }
        } catch(e) {
            console.error("Erro ao calcular faturação líquida:", e);
            const liquidoEl = document.getElementById('kpi-faturamento-liquido');
            if (liquidoEl) { liquidoEl.textContent = "Erro"; }
        }
    };

    const contractsQuery = query(collection(db, `/artifacts/${appId}/public/data/clients`), where("status", "==", "Ativo"));
    onSnapshot(contractsQuery, (snapshot) => {
        const container = document.getElementById('alertas-contratos');
        if (!container) return; 
        container.innerHTML = '';
        let hasAlert = false;
        snapshot.forEach(doc => {
            const client = doc.data();
            const days = getDaysRemaining(client.dataTermino);
            if (days <= 30) {
                hasAlert = true;
                container.innerHTML += `
                    <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-md">
                        <div>
                            <p class="font-semibold text-rocket-yellow-600">${client.nome}</p>
                            <p class="text-sm text-yellow-500">Vence em ${days} dias (${formatDate(client.dataTermino)})</p>
                        </div>
                        <button onclick="window.handleViewClient('${doc.id}')" class="text-sm text-rocket-yellow-600 hover:underline">Ver</button>
                    </div>
                `;
            }
        });
        if (!hasAlert) {
            container.innerHTML = '<p class="text-gray-500">Nenhum contrato a vencer.</p>';
        }
    }, (e) => { handleFriendlyError("Erro no Dashboard (Contratos)", e.message, e); });
    
    const paymentsQuery = query(collection(db, `/artifacts/${appId}/public/data/payments`), 
        where("status", "==", "Pendente")
    );
    onSnapshot(paymentsQuery, async (snapshot) => {
        const container = document.getElementById('alertas-pagamentos');
        if (!container) return; 
        container.innerHTML = '';
        let hasAlert = false; 
        
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Nenhum pagamento pendente registado.</p>';
            return;
        }
        
        for (const docSnap of snapshot.docs) {
            const payment = docSnap.data();
            const dueDate = payment.dataVencimento;
            
            if (dueDate >= today && dueDate <= nextWeekStr) {
                hasAlert = true; 
                const clientName = allClientsData[payment.clientId]?.nome || "Cliente...";
                container.innerHTML += `
                    <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-md">
                        <div>
                            <p class="font-semibold text-rocket-yellow-600">${clientName}</p>
                            <p class="text-sm text-yellow-500">${payment.descricao} - ${formatCurrency(payment.valor)}</p>
                        </div>
                        <button onclick="window.handleViewClient('${payment.clientId}')" class="text-sm text-rocket-yellow-600 hover:underline">Ver</button>
                    </div>
                `;
            }
        }
        
        if (!hasAlert) {
            container.innerHTML = '<p class="text-gray-500">Nenhum pagamento a vencer esta semana.</p>';
        }
    }, (e) => { handleFriendlyError("Erro no Dashboard (Pagamentos)", e.message, e); });

    loadCompanyGoalsData();
};

// --- CLIENTES (CRUD) ---

const loadAllClientsToCache = async () => {
    if (!userId || !db) return;
    const q = query(collection(db, `/artifacts/${appId}/public/data/clients`));
    onSnapshot(q, (snapshot) => {
        allClientsData = {}; 
        snapshot.forEach(doc => {
            allClientsData[doc.id] = { id: doc.id, ...doc.data() };
        });
    }, (e) => { handleFriendlyError("Erro Crítico: Falha ao carregar cache de clientes.", e.message, e); });
};

const loadClientsList = () => {
    if (!userId || !db) return;
    const q = query(collection(db, `/artifacts/${appId}/public/data/clients`));
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('clients-list-table');
        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-gray-500">Nenhum cliente cadastrado.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const client = doc.data();
            const statusColor = client.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <p class="text-sm font-semibold text-gray-900">${client.nome}</p>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                            ${client.status}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${formatDate(client.dataTermino)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button onclick="window.handleViewClient('${doc.id}')" class="text-rocket-yellow-600 hover:text-rocket-yellow-500">Ver Detalhes</button>
                        <button onclick="window.handleDeleteClick('clients', '${doc.id}')" class="text-red-600 hover:text-red-800">Excluir</button>
                    </td>
                </tr>
            `;
        });
    }, (e) => { handleFriendlyError("Erro ao carregar lista de clientes.", e.message, e); });
};

const openClientModal = async (clientId = null, initialData = null) => {
    const form = document.getElementById('clientForm');
    form.reset();
    document.getElementById('clientId').value = '';
    document.getElementById('conversionSource').value = '';
    document.getElementById('clientPaymentTypeInput').disabled = false;
    document.getElementById('clientInstallmentsInput').disabled = true;
    document.getElementById('clientInstallmentsInput').required = false;

    if (clientId) {
        // Modo Edição
        document.getElementById('clientModalTitle').textContent = 'Editar Cliente';
        try {
            const clientDoc = await getDoc(doc(db, `/artifacts/${appId}/public/data/clients/${clientId}`));
            const data = clientDoc.data(); 
            if (clientDoc.exists()) {
                document.getElementById('clientId').value = clientId;
                document.getElementById('clientNameInput').value = data.nome || '';
                document.getElementById('clientPhoneInput').value = data.telefone || '';
                document.getElementById('clientStartDateInput').value = data.dataInicio || '';
                document.getElementById('clientEndDateInput').value = data.dataTermino || '';
                document.getElementById('clientValueInput').value = data.valorTotal || 0;
                document.getElementById('clientStatusInput').value = data.status || 'Ativo';
            }
            document.getElementById('clientPaymentTypeInput').value = (data && data.monthlyValue > 0) ? 'parcelado' : 'unico';
            document.getElementById('clientPaymentTypeInput').disabled = true;
            document.getElementById('clientInstallmentsInput').value = '';
            document.getElementById('clientInstallmentsInput').disabled = true;

        } catch(e) { 
            console.error("Erro ao abrir modal de cliente:", e); 
            handleFriendlyError("Erro ao carregar dados do cliente.", e.message, e);
        }
    } else {
        // Modo Novo
        document.getElementById('clientModalTitle').textContent = 'Novo Cliente';
        if (initialData) {
            document.getElementById('clientNameInput').value = initialData.nome || '';
            document.getElementById('clientPhoneInput').value = initialData.telefone || ''; 
        }
    }
    showModal('clientModal');
};

const handleClientFormSubmit = async (e) => {
    e.preventDefault();
    if (!userId) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "A salvar...";
    
    const clientId = document.getElementById('clientId').value;
    const clientData = {
        nome: document.getElementById('clientNameInput').value,
        telefone: document.getElementById('clientPhoneInput').value,
        dataInicio: document.getElementById('clientStartDateInput').value,
        dataTermino: document.getElementById('clientEndDateInput').value,
        valorTotal: parseFloat(document.getElementById('clientValueInput').value),
        status: document.getElementById('clientStatusInput').value,
        ownerId: userId
    };
    const valorVenda = clientData.valorTotal;

    let monthlyValue = 0;
    const paymentType = document.getElementById('clientPaymentTypeInput').value;
    const installments = parseInt(document.getElementById('clientInstallmentsInput').value) || 0;
    
    if (paymentType === 'parcelado' && installments > 0) {
        monthlyValue = parseFloat((clientData.valorTotal / installments).toFixed(2));
    }
    clientData.monthlyValue = monthlyValue;
    
    const conversionSource = document.getElementById('conversionSource').value;
    document.getElementById('conversionSource').value = ''; 

    try {
        let savedClientId = clientId; 
        
        if (clientId) {
            // Atualiza
            const clientRef = doc(db, `/artifacts/${appId}/public/data/clients/${clientId}`);
            const oldDoc = await getDoc(clientRef);
            clientData.monthlyValue = clientData.monthlyValue || (oldDoc.exists() ? oldDoc.data().monthlyValue : 0) || 0;
            await updateDoc(clientRef, clientData);
        } else {
            // Cria
            const docRef = await addDoc(collection(db, `/artifacts/${appId}/public/data/clients`), clientData);
            savedClientId = docRef.id; 
            
            const saleType = (conversionSource === 'prospect') ? 'Prospecção Fechada' : 'Novo Contrato Manual';
            
            await addDoc(collection(db, `/artifacts/${appId}/public/data/sales`), {
                tipo: saleType,
                valor: valorVenda,
                data: new Date().toISOString().split('T')[0], 
                clientId: savedClientId,
                ownerId: userId
            });
            
            if (paymentType === 'parcelado' && installments > 0) {
                const totalValue = clientData.valorTotal;
                const installmentValue = monthlyValue; 
                const startDate = new Date(clientData.dataInicio + "T12:00:00"); 
                
                const batch = writeBatch(db);
                
                for (let i = 1; i <= installments; i++) {
                    const dueDate = new Date(startDate);
                    dueDate.setMonth(startDate.getMonth() + (i - 1)); 
                    
                    const paymentData = {
                        clientId: savedClientId,
                        descricao: `Parcela ${i} de ${installments}`,
                        valor: installmentValue,
                        dataVencimento: dueDate.toISOString().split('T')[0], 
                        status: 'Pendente',
                        ownerId: userId
                    };
                    
                    const newPaymentRef = doc(collection(db, `/artifacts/${appId}/public/data/payments`));
                    batch.set(newPaymentRef, paymentData);
                }
                
                await batch.commit(); 
            }
        }
        
        hideModal('clientModal');
        
        if(currentClientId === savedClientId) { 
            loadClientDetail(savedClientId); 
        }

    } catch (e) {
        console.error("Erro ao salvar cliente:", e);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Salvar Cliente";
    }
};

// --- DETALHE DO CLIENTE ---

window.handleViewClient = (clientId) => {
    currentClientId = clientId;
    loadClientDetail(clientId);
    showPage('clientDetailPage');
    switchTab('financial', '.tab-link', '.tab-content'); 
};

const loadClientDetail = (clientId) => {
    if (!userId || !clientId || !db) return;
    
    const clientRef = doc(db, `/artifacts/${appId}/public/data/clients/${clientId}`);
    onSnapshot(clientRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            document.getElementById('detail-client-name').textContent = data.nome;
            document.getElementById('detail-client-phone').textContent = data.telefone || 'N/A';
            document.getElementById('detail-client-value').textContent = formatCurrency(data.valorTotal);
            document.getElementById('detail-client-status').textContent = data.status;
            document.getElementById('detail-client-days').textContent = getDaysRemaining(data.dataTermino) + ' dias';
        } else {
            console.error("Cliente não encontrado");
            showPage('clientsPage'); 
        }
    }, (e) => { handleFriendlyError("Erro ao carregar detalhe do cliente.", e.message, e); });
    
    loadClientPayments(clientId);
    loadClientTasks(clientId);
    loadClientCredentials(clientId);
};

// --- Financeiro (Detalhe Cliente) ---

// ******************************************************
// ***** ATENÇÃO: CORREÇÃO DO BUG DAS PARCELAS (PONTO 1) *****
// ******************************************************
const loadClientPayments = (clientId) => {
    if (!userId || !db) return;
    
    // CORREÇÃO: Adicionado 'orderBy("dataVencimento")' para ordenar pela data
    const q = query(
        collection(db, `/artifacts/${appId}/public/data/payments`), 
        where("clientId", "==", clientId),
        orderBy("dataVencimento", "asc") // "asc" = ascendente (mais antigo primeiro)
    );
    
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('payments-list');
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500 text-sm">Nenhum pagamento registado.</p>';
            return;
        }
        
        // O 'snapshot.forEach' agora já virá ordenado do Firebase
        snapshot.forEach(doc => {
            const p = doc.data();
            const statusColor = p.status === 'Pago' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            
            let actionButton = '';
            if (p.status === 'Pendente') {
                actionButton = `<button onclick="window.markPaymentStatus('${doc.id}', 'Pago')" class="text-sm font-medium text-green-600 hover:text-green-800">Marcar como Pago</button>`;
            } else {
                actionButton = `<button onclick="window.markPaymentStatus('${doc.id}', 'Pendente')" class="text-sm font-medium text-gray-500 hover:text-gray-700">Desfazer</button>`;
            }
            
            container.innerHTML += `
                <div class="flex flex-col sm:flex-row justify-between sm:items-center p-4 border rounded-md hover:bg-gray-50">
                    <div>
                        <p class="font-semibold text-gray-800">${p.descricao}</p>
                        <p class="text-sm text-gray-600">${formatCurrency(p.valor)} - Venc: ${formatDate(p.dataVencimento)}</p>
                    </div>
                    <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 mt-2 sm:mt-0">
                        <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                            ${p.status}
                        </span>
                        ${actionButton}
                        <button onclick="window.handleDeleteClick('payments', '${doc.id}')" class="text-red-600 hover:text-red-800"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
        renderIcons();
    }, (e) => { 
        // NOTA: Se esta função falhar, pode ser porque o índice do Firestore não foi criado.
        // O Firebase geralmente fornece um link de erro no console para criar o índice com um clique.
        handleFriendlyError("Erro ao carregar pagamentos (Verifique o console para criar o índice no Firebase se necessário).", e.message, e); 
    });
};
// ******************************************************
// ***** FIM DA CORREÇÃO *****
// ******************************************************

window.markPaymentStatus = async (paymentId, newStatus) => {
    if (!userId || !db) return;
    try {
        const paymentRef = doc(db, `/artifacts/${appId}/public/data/payments/${paymentId}`);
        await updateDoc(paymentRef, { status: newStatus });
    } catch(e) {
        console.error("Erro ao atualizar status:", e);
    }
};

const handleAddPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "A salvar...";

    const data = {
        clientId: currentClientId,
        descricao: document.getElementById('paymentDesc').value,
        valor: parseFloat(document.getElementById('paymentValue').value),
        dataVencimento: document.getElementById('paymentDueDate').value,
        status: 'Pendente',
        ownerId: userId
    };
    
    try {
        await addDoc(collection(db, `/artifacts/${appId}/public/data/payments`), data);
        
        const isUpsell = document.getElementById('paymentIsUpsell').checked;
        if (isUpsell) {
            await addDoc(collection(db, `/artifacts/${appId}/public/data/sales`), {
                tipo: 'Upsell',
                valor: data.valor,
                data: new Date().toISOString().split('T')[0],
                clientId: currentClientId,
                ownerId: userId
            });
        }
        
        document.getElementById('addPaymentForm').reset();
        document.getElementById('paymentIsUpsell').checked = true;
    } catch(e) { 
        console.error("Erro ao adicionar pagamento:", e);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Adicionar Serviço";
    }
};

// --- Tarefas (Detalhe Cliente) ---

const loadClientTasks = (clientId) => {
     if (!userId || !db) return;
     const q = query(collection(db, `/artifacts/${appId}/public/data/tasks`), where("clientId", "==", clientId));
     onSnapshot(q, (snapshot) => {
         const container = document.getElementById('tasks-list');
         if (!container) return; 
         container.innerHTML = '';
         if(snapshot.empty) {
             container.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma tarefa registada.</p>';
             return;
         }
         snapshot.forEach(doc => {
             const task = doc.data();
             const isDone = task.status === 'Feito';
             container.innerHTML += `
                 <div class="flex justify-between items-center p-4 border rounded-md ${isDone ? 'bg-gray-50' : ''}">
                     <div class="flex items-center gap-3">
                         <input type="checkbox" onchange="window.toggleTaskStatus('${doc.id}', ${isDone})" ${isDone ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-rocket-yellow-400 focus:ring-rocket-yellow-300">
                         <p class="${isDone ? 'line-through text-gray-500' : 'text-gray-800'}">${task.descricao}</p>
                     </div>
                     <button onclick="window.handleDeleteClick('tasks', '${doc.id}')" class="text-red-600 hover:text-red-800"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                 </div>
             `;
         });
         renderIcons();
      }, (e) => { handleFriendlyError("Erro ao carregar tarefas.", e.message, e); });
};

const handleAddTaskSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const desc = document.getElementById('taskDesc').value;
    if(!desc) {
        submitButton.disabled = false;
        return;
    }
    
    try {
        await addDoc(collection(db, `/artifacts/${appId}/public/data/tasks`), {
            clientId: currentClientId,
            descricao: desc,
            status: 'A Fazer',
            ownerId: userId
        });
        document.getElementById('addTaskForm').reset();
    } catch (e) {
        console.error("Erro ao adicionar tarefa:", e);
    } finally {
        submitButton.disabled = false;
    }
};

window.toggleTaskStatus = async (taskId, isDone) => {
    if (!userId || !db) return;
    const newStatus = isDone ? 'A Fazer' : 'Feito';
    await updateDoc(doc(db, `/artifacts/${appId}/public/data/tasks/${taskId}`), { status: newStatus });
};

// --- Senhas (Detalhe Cliente) ---

const loadClientCredentials = (clientId) => {
    if (!userId || !db) return;
    const q = query(collection(db, `/artifacts/${appId}/public/data/credentials`), where("clientId", "==", clientId));
     onSnapshot(q, (snapshot) => {
         const container = document.getElementById('credentials-list');
         if (!container) return; 
         container.innerHTML = '';
         if(snapshot.empty) {
             container.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma credencial registada.</p>';
             return;
         }
         snapshot.forEach(doc => {
             const cred = doc.data();
             container.innerHTML += `
                 <div class="p-4 border rounded-md">
                     <div class="flex justify-between items-center">
                         <h4 class="font-semibold text-gray-800">${cred.servico}</h4>
                         <button onclick="window.handleDeleteClick('credentials', '${doc.id}')" class="text-red-600 hover:text-red-800"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                     </div>
                     <div class="text-sm text-gray-600 mt-2">
                         <p><strong>Login:</strong> ${cred.login}</p>
                         <p><strong>Senha:</strong> <span id="pass-${doc.id}" data-pass="${cred.senha}">••••••••</span> 
                             <button onclick="window.togglePassword('pass-${doc.id}')" class="ml-2 text-rocket-yellow-600 text-xs">(Mostrar)</button>
                         </p>
                     </div>
                 </div>
             `;
         });
         renderIcons();
      }, (e) => { handleFriendlyError("Erro ao carregar credenciais.", e.message, e); });
};

const handleAddCredentialSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        await addDoc(collection(db, `/artifacts/${appId}/public/data/credentials`), {
            clientId: currentClientId,
            servico: document.getElementById('credService').value,
            login: document.getElementById('credLogin').value,
            senha: document.getElementById('credPassword').value,
            ownerId: userId
        });
        document.getElementById('addCredentialForm').reset();
    } catch (e) {
        console.error("Erro ao adicionar credencial:", e);
    } finally {
         submitButton.disabled = false;
    }
};

window.togglePassword = (elementId) => {
    const el = document.getElementById(elementId);
    const btn = el.nextElementSibling;
    if (el.textContent === '••••••••') {
        el.textContent = el.dataset.pass;
        btn.textContent = "(Ocultar)";
    } else {
        el.textContent = '••••••••';
        btn.textContent = "(Mostrar)";
    }
};

// --- PROSPECÇÃO (VISÃO KANBAN) ---

const KANBAN_COLUMNS = [ 
    { id: 'prospeccao', title: 'Prospecção' },
    { id: 'contato', title: 'Contato Feito' },
    { id: 'negociando', title: 'Negociando' },
    { id: 'fechado', title: 'Fechado' },
    { id: 'perdido', title: 'Perdido' }
];

// ATUALIZAÇÃO: Carrega o KANBAN com os novos dados (Nível e Próxima Ação)
const loadProspects = () => {
    if (!userId || !db) return;
    
    const colProspeccao = document.getElementById('kanban-col-prospeccao');
    const colContato = document.getElementById('kanban-col-contato');
    const colNegociando = document.getElementById('kanban-col-negociando');

    if (!colProspeccao || !colContato || !colNegociando) return;

    const loadingHtml = '<p class="text-sm text-gray-500 p-2">A carregar...</p>';
    colProspeccao.innerHTML = loadingHtml;
    colContato.innerHTML = loadingHtml;
    colNegociando.innerHTML = loadingHtml;

    const q = query(
        collection(db, `/artifacts/${appId}/public/data/prospects`), 
        where("status", "in", ["prospeccao", "contato", "negociando"])
    );

    onSnapshot(q, (snapshot) => {
        let htmlP = '', htmlC = '', htmlN = '';
        let countP = 0, countC = 0, countN = 0;

        snapshot.forEach(doc => {
            const prospect = { id: doc.id, ...doc.data() };
            
            const labelHtml = prospect.label 
                ? `<span class="text-xs font-semibold px-2 py-0.5 bg-rocket-yellow-300 text-rocket-dark rounded-full">${prospect.label}</span>` 
                : '';
            
            // NOVO: Define Nível de Interesse (Quente/Morno/Frio)
            let interestHtml = '';
            switch (prospect.interestLevel) {
                case 'Quente': interestHtml = '<span title="Quente" class="text-xs">🔥🔥</span>'; break;
                case 'Morno': interestHtml = '<span title="Morno" class="text-xs">🔥</span>'; break;
                case 'Frio': interestHtml = '<span title="Frio" class="text-xs">❄️</span>'; break;
            }

            // NOVO: Define Próxima Ação Agendada
            let nextActionHtml = '';
            if (prospect.nextActionDate) {
                const actionDate = new Date(prospect.nextActionDate + "T12:00:00");
                const today = new Date();
                today.setHours(0,0,0,0);
                
                let dateColor = 'text-gray-500'; // Futuro
                if (actionDate < today) dateColor = 'text-red-500'; // Atrasado
                else if (actionDate.getTime() === today.getTime()) dateColor = 'text-blue-600'; // Hoje
                
                nextActionHtml = `
                    <div class="mt-2 flex items-center gap-2 ${dateColor}" title="${prospect.nextAction || 'Ação agendada'}">
                        <i data-lucide="calendar" class="w-3 h-3"></i>
                        <span class="text-xs font-semibold">${formatDate(prospect.nextActionDate)}</span>
                    </div>
                `;
            }

            // Monta o Card HTML Atualizado
            const cardHtml = `
                <div class="bg-white p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg" onclick="window.openProspectDetailModal('${prospect.id}')">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-gray-900">${prospect.nome}</h4>
                        <div class="flex items-center gap-2">
                            ${interestHtml}
                            ${labelHtml}
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 truncate">${prospect.email || 'Sem email'}</p>
                    ${nextActionHtml}
                </div>
            `;

            switch (prospect.status) {
                case 'prospeccao': htmlP += cardHtml; countP++; break;
                case 'contato': htmlC += cardHtml; countC++; break;
                case 'negociando': htmlN += cardHtml; countN++; break;
            }
        });

        colProspeccao.innerHTML = htmlP || '<p class="text-sm text-gray-500 p-2">Nenhum prospect aqui.</p>';
        colContato.innerHTML = htmlC || '<p class="text-sm text-gray-500 p-2">Nenhum prospect aqui.</p>';
        colNegociando.innerHTML = htmlN || '<p class="text-sm text-gray-500 p-2">Nenhum prospect aqui.</p>';

        document.getElementById('kanban-count-prospeccao').textContent = countP;
        document.getElementById('kanban-count-contato').textContent = countC;
        document.getElementById('kanban-count-negociando').textContent = countN;
        
        renderIcons();

    }, (e) => { 
        handleFriendlyError("Erro ao carregar funil de prospecção.", e.message, e);
    });
};

const handleAddProspectFormSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        await addDoc(collection(db, `/artifacts/${appId}/public/data/prospects`), {
            nome: document.getElementById('prospectNameInput').value,
            email: document.getElementById('prospectEmailInput').value,
            origem: document.getElementById('prospectOriginInput').value,
            services: getSelectedServices('prospectServicesCheckboxes'),
            status: 'prospeccao', 
            createdAt: new Date().
