// app.js (COMPLETO - 1544 Linhas)
// Começa aqui
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
            createdAt: new Date().toISOString(), 
            label: '', 
            // NOVO: Adiciona campos do Super-Modal como vazios
            notes: [], // Agora é um array para o histórico
            interestLevel: 'Nenhum',
            nextAction: '',
            nextActionDate: '',
            instaLink: '',
            gmnLink: '',
            ownerId: userId
        });
        hideModal('prospectModal');
        document.getElementById('prospectForm').reset();
    } catch (e) {
        console.error("Erro ao salvar prospect:", e);
    } finally {
        submitButton.disabled = false;
    }
};

// ATUALIZAÇÃO: Abre o "Super-Modal"
window.openProspectDetailModal = async (prospectId) => {
    if (!prospectId) return;
    currentProspectId = prospectId; 
    
    // Reseta o formulário e as abas
    const form = document.getElementById('prospectDetailForm');
    form.reset();
    document.getElementById('addProspectNoteForm').reset();
    document.getElementById('geminiAnalysisResult').innerHTML = '<p class="text-gray-500 text-sm">A análise da IA aparecerá aqui...</p>';
    // Ativa a primeira aba (Detalhes) por padrão
    switchTab('details', '.modal-tab-link', '.modal-tab-content');
    
    try {
        const prospectRef = doc(db, `/artifacts/${appId}/public/data/prospects/${prospectId}`);
        const docSnap = await getDoc(prospectRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Aba 1: Detalhes
            document.getElementById('prospectDetailId').value = prospectId;
            document.getElementById('prospectDetailModalTitle').textContent = data.nome || 'Detalhes do Prospect';
            document.getElementById('prospectDetailName').value = data.nome || '';
            document.getElementById('prospectDetailEmail').value = data.email || '';
            document.getElementById('prospectDetailOrigin').value = data.origem || '';
            document.getElementById('prospectDetailLabel').value = data.label || '';
            document.getElementById('prospectDetailStatus').value = data.status || 'prospeccao';
            // Novos Campos
            document.getElementById('prospectDetailInterestLevel').value = data.interestLevel || 'Nenhum';
            document.getElementById('prospectDetailNextAction').value = data.nextAction || '';
            document.getElementById('prospectDetailActionDate').value = data.nextActionDate || '';
            document.getElementById('prospectDetailInstaLink').value = data.instaLink || '';
            document.getElementById('prospectDetailGMNLink').value = data.gmnLink || '';
            
            renderServicesCheckboxes('prospectDetailServicesCheckboxes', data.services || []);
            
            // Aba 2: Histórico
            loadProspectNotes(data.notes || []); // Carrega os comentários

            // Aba 3: IA (Carrega API Key salva localmente)
            document.getElementById('geminiApiKeyInput').value = localStorage.getItem('geminiApiKey') || '';

            // Botão de Converter
            const convertBtn = document.getElementById('convertProspectBtn');
            convertBtn.classList.toggle('hidden', data.status !== 'fechado');
            
            showModal('prospectDetailModal');
        } else {
            console.error("Prospect não encontrado");
        }
    } catch(e) {
         handleFriendlyError("Erro ao carregar prospect.", e.message, e);
    }
};

// ATUALIZAÇÃO: Salva os dados do "Super-Modal"
const handleProspectDetailFormSubmit = async (e) => {
    e.preventDefault();
    if (!currentProspectId) return;
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    
    const newStatus = document.getElementById('prospectDetailStatus').value;
    
    const dataToUpdate = {
        nome: document.getElementById('prospectDetailName').value,
        email: document.getElementById('prospectDetailEmail').value,
        origem: document.getElementById('prospectDetailOrigin').value,
        label: document.getElementById('prospectDetailLabel').value,
        status: newStatus,
        services: getSelectedServices('prospectDetailServicesCheckboxes'),
        // Novos Campos
        interestLevel: document.getElementById('prospectDetailInterestLevel').value,
        nextAction: document.getElementById('prospectDetailNextAction').value,
        nextActionDate: document.getElementById('prospectDetailActionDate').value,
        instaLink: document.getElementById('prospectDetailInstaLink').value,
        gmnLink: document.getElementById('prospectDetailGMNLink').value,
    };
    
    try {
        const prospectRef = doc(db, `/artifacts/${appId}/public/data/prospects/${currentProspectId}`);
        await updateDoc(prospectRef, dataToUpdate);
        
        const convertBtn = document.getElementById('convertProspectBtn');
        convertBtn.classList.toggle('hidden', newStatus !== 'fechado');
        
        hideModal('prospectDetailModal');
        currentProspectId = null;
    } catch (e) {
        console.error("Erro ao atualizar prospect:", e);
    } finally {
        submitButton.disabled = false;
    }
};

// NOVO: Carrega o histórico de comentários
const loadProspectNotes = (notesArray) => {
    const container = document.getElementById('prospectDetailNotesList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!notesArray || notesArray.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Nenhum comentário adicionado.</p>';
        return;
    }
    
    // Ordena do mais novo para o mais antigo
    notesArray.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    notesArray.forEach(note => {
        container.innerHTML += `
            <div class="comment-item">
                <p>${note.text}</p>
                <span class="block text-right">${formatDateTime(note.date)}</span>
            </div>
        `;
    });
};

// NOVO: Adiciona um novo comentário ao histórico
const handleAddProspectNoteSubmit = async (e) => {
    e.preventDefault();
    if (!currentProspectId) return;

    const newNoteText = document.getElementById('prospectDetailNewNote').value;
    if (!newNoteText.trim()) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const note = {
        text: newNoteText,
        date: new Date().toISOString()
    };

    try {
        const prospectRef = doc(db, `/artifacts/${appId}/public/data/prospects/${currentProspectId}`);
        const docSnap = await getDoc(prospectRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const existingNotes = data.notes || [];
            const updatedNotes = [...existingNotes, note];
            
            await updateDoc(prospectRef, { notes: updatedNotes });
            
            // Atualiza a UI
            loadProspectNotes(updatedNotes);
            document.getElementById('addProspectNoteForm').reset();
        }
    } catch (e) {
        console.error("Erro ao adicionar nota:", e);
        handleFriendlyError("Erro ao salvar comentário", e.message, e);
    } finally {
        submitButton.disabled = false;
    }
};

 
// Corrigido: Passa os dados do prospect para a função de conversão
window.convertProspectToClient = async (prospectId) => {
     if (!userId || !db) return;
     
     try {
         const prospectRef = doc(db, `/artifacts/${appId}/public/data/prospects/${prospectId}`);
         const prospectDoc = await getDoc(prospectRef);
         
         if (!prospectDoc.exists()) {
             console.error("Prospect não encontrado para conversão");
             return;
         }
         
         const prospect = prospectDoc.data();
         const prospectName = prospect.nome;
         const prospectContact = prospect.telefone || prospect.email || '';

         document.getElementById('deleteModalText').textContent = `Deseja realmente converter o prospect "${prospectName}" em um novo cliente? O prospect será removido do funil.`;
         currentDeleteInfo = { 
             collectionName: 'prospects-convert', 
             docId: prospectId, 
             data: { nome: prospectName, telefone: prospectContact } 
         };
         showModal('deleteModal');
         
     } catch(e) {
         console.error("Erro ao buscar prospect para converter:", e);
     }
};

// --- NOVO: LÓGICA DA IA (GEMINI) ---

// Salva a API Key no Local Storage (seguro apenas no navegador do usuário)
const handleApiKeySave = () => {
    const apiKey = document.getElementById('geminiApiKeyInput').value;
    if (apiKey) {
        localStorage.setItem('geminiApiKey', apiKey);
    }
};

// Função principal da IA
const handleGeminiAnalysis = async () => {
    const apiKey = document.getElementById('geminiApiKeyInput').value;
    if (!apiKey) {
        alert("Por favor, insira a sua Chave da API do Gemini.");
        return;
    }
    
    // Salva a chave para uso futuro
    handleApiKeySave();

    // Verifica se a biblioteca foi importada
    if (typeof GoogleGenerativeAI === 'undefined') {
        alert("Erro: A biblioteca do GoogleGenerativeAI não foi carregada. Descomente a linha 'import' no início do <script>.");
        return;
    }
    
    const resultContainer = document.getElementById('geminiAnalysisResult');
    const generateBtn = document.getElementById('generateGeminiAnalysisBtn');
    resultContainer.innerHTML = '<p class="text-gray-700 text-sm">A analisar... Por favor, aguarde. Isto pode demorar alguns segundos.</p>';
    generateBtn.disabled = true;

    // Pega os dados do prospect dos campos
    const nome = document.getElementById('prospectDetailName').value;
    const instaLink = document.getElementById('prospectDetailInstaLink').value;
    const gmnLink = document.getElementById('prospectDetailGMNLink').value;

    if (!instaLink && !gmnLink) {
         resultContainer.innerHTML = '<p class="text-red-500 text-sm">Erro: Preencha pelo menos o Link do Instagram ou do Google Meu Negócio na aba "Detalhes" para a análise.</p>';
         generateBtn.disabled = false;
         return;
    }

    const prompt = `
         Você é um especialista em marketing digital para pizzarias (Rocket for Eat).
         Analise o posicionamento digital do prospect abaixo e gere uma breve análise (máximo 3 parágrafos) focada em PONTOS DE MELHORIA e OPORTUNIDADES que a Rocket for Eat pode vender.

         Seja direto e acionável.

         Prospect: ${nome}
         Instagram: ${instaLink || 'Não fornecido'}
         Google Meu Negócio: ${gmnLink || 'Não fornecido'}

         Estruture a resposta:
         1.  **Análise Rápida:** (O que você vê de bom ou ruim)
         2.  **Pontos de Melhoria:** (O que está faltando)
         3.  **Oportunidades (Serviços):** (O que a Rocket for Eat pode oferecer)
     `;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Formata o texto da IA para HTML (substitui quebras de linha e negrito)
        let htmlText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negrito
            .replace(/\n/g, '<br>'); // Quebra de linha

        resultContainer.innerHTML = `<div class="text-sm text-gray-800 space-y-2">${htmlText}</div>`;

    } catch (e) {
        console.error("Erro na API do Gemini:", e);
        resultContainer.innerHTML = `<p class="text-red-500 text-sm">Erro ao gerar análise: ${e.message}. Verifique sua API Key ou o console.</p>`;
    } finally {
        generateBtn.disabled = false;
    }
};

 
// --- CONTAS A RECEBER ---

const loadReceivablesReport = () => {
    if (!userId || !db) return;

    // ATENÇÃO: Também aplica a ordenação por data aqui
    const paymentsQuery = query(
        collection(db, `/artifacts/${appId}/public/data/payments`),
        orderBy("dataVencimento", "asc") 
    );
    
    onSnapshot(paymentsQuery, (snapshot) => {
        const lateContainer = document.getElementById('late-payments-list');
        const upcomingContainer = document.getElementById('upcoming-payments-list');
        const paidThisMonthContainer = document.getElementById('paid-this-month-list');
        
        if (!lateContainer || !upcomingContainer || !paidThisMonthContainer) return; 

        lateContainer.innerHTML = '';
        upcomingContainer.innerHTML = '';
        paidThisMonthContainer.innerHTML = '';

        let hasLate = false, hasUpcoming = false, hasPaidThisMonth = false;

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        snapshot.forEach(doc => {
            const payment = doc.data();
            const dueDate = new Date(payment.dataVencimento + "T12:00:00"); 
            dueDate.setHours(0, 0, 0, 0); 
            const clientName = allClientsData[payment.clientId]?.nome || "Cliente...";

            const paymentHtml = `
                <div class="flex flex-col sm:flex-row justify-between sm:items-center p-3 border rounded-md hover:bg-gray-50">
                    <div>
                        <p class="font-semibold text-gray-800">${clientName} - ${payment.descricao}</p>
                        <p class="text-sm text-gray-600">${formatCurrency(payment.valor)} - Venc: ${formatDate(payment.dataVencimento)}</p>
                    </div>
                    <button onclick="window.handleViewClient('${payment.clientId}')" class="text-sm text-rocket-yellow-600 hover:underline mt-2 sm:mt-0">Ver Cliente</button>
                </div>
            `;

            if (payment.status === 'Pendente') {
                if (dueDate < today) {
                    lateContainer.innerHTML += `<div class="bg-red-50">${paymentHtml}</div>`;
                    hasLate = true;
                } else {
                    upcomingContainer.innerHTML += `<div class="bg-blue-50">${paymentHtml}</div>`;
                    hasUpcoming = true;
                }
            } else if (payment.status === 'Pago') {
                const paymentDate = new Date(payment.dataVencimento + "T12:00:00");
                if (paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear) {
                   paidThisMonthContainer.innerHTML += `<div class="bg-green-50">${paymentHtml}</div>`;
                   hasPaidThisMonth = true;
                }
            }
        });

        if (!hasLate) lateContainer.innerHTML = '<p class="text-gray-500">Nenhum pagamento atrasado.</p>';
        if (!hasUpcoming) upcomingContainer.innerHTML = '<p class="text-gray-500">Nenhum pagamento previsto.</p>';
        if (!hasPaidThisMonth) paidThisMonthContainer.innerHTML = '<p class="text-gray-500">Nenhum pagamento registado como pago este mês.</p>';
        
        renderIcons();
    }, (e) => { handleFriendlyError("Erro ao carregar relatório financeiro (Verifique o índice no Firebase).", e.message, e); });
};

// --- DESPESAS ---

const loadExpensesPage = () => {
    if (!userId || !db) return;
    
    const { start } = getCurrentMonthRange();
    const q = query(collection(db, `/artifacts/${appId}/public/data/expenses`), where("data", ">=", start));
    
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('expenses-list');
        if (!container) return; 
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Nenhuma despesa registada este mês.</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const expense = doc.data();
            container.innerHTML += `
                <div class="flex justify-between items-center p-4 border rounded-md hover:bg-gray-50">
                    <div>
                        <p class="font-semibold text-gray-800">${expense.descricao}</p>
                        <p class="text-sm text-gray-600">${formatDate(expense.data)}</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="font-semibold text-red-600">${formatCurrency(expense.valor)}</span>
                        <button onclick="window.handleDeleteClick('expenses', '${doc.id}')" class="text-red-600 hover:text-red-800"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
        renderIcons();
    }, (e) => { handleFriendlyError("Erro ao carregar despesas.", e.message, e); });
};

const handleExpenseFormSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const data = {
        descricao: document.getElementById('expenseDesc').value,
        valor: parseFloat(document.getElementById('expenseValue').value),
        data: document.getElementById('expenseDate').value || new Date().toISOString().split('T')[0], 
        ownerId: userId
    };
    
    try {
        await addDoc(collection(db, `/artifacts/${appId}/public/data/expenses`), data);
        document.getElementById('addExpenseForm').reset();
    } catch (e) {
        console.error("Erro ao adicionar despesa:", e);
    } finally {
        submitButton.disabled = false;
    }
};

 
// --- TAREFAS GLOBAIS ---

const loadGlobalTasks = () => {
    if (!userId || !db) return;

    const clientFilterSelect = document.getElementById('globalTaskClientFilter');
    const currentValue = clientFilterSelect.value; 
    clientFilterSelect.innerHTML = '<option value="all">Todos os Clientes</option>';
    
    const sortedClients = Object.values(allClientsData).sort((a, b) => a.nome.localeCompare(b.nome));
    
    sortedClients.forEach(client => {
         clientFilterSelect.innerHTML += `<option value="${client.id}">${client.nome}</option>`;
    });
    
    clientFilterSelect.value = currentValue; 
    
    applyGlobalTaskFilters(); 
};

const applyGlobalTaskFilters = () => {
    if (!userId || !db) return;

    const selectedClient = document.getElementById('globalTaskClientFilter').value;
    const selectedStatus = document.getElementById('globalTaskStatusFilter').value;
    const container = document.getElementById('global-tasks-list');
    if (!container) return; 
    container.innerHTML = '<p class="text-gray-500">A carregar tarefas...</p>'; 

    let q = collection(db, `/artifacts/${appId}/public/data/tasks`);
    let filters = [];

    if (selectedClient !== 'all') {
        filters.push(where("clientId", "==", selectedClient));
    }
    if (selectedStatus !== 'all') {
        filters.push(where("status", "==", selectedStatus));
    }
    
    const filteredQuery = query(q, ...filters);

    onSnapshot(filteredQuery, (snapshot) => {
        if (!container) return; 
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Nenhuma tarefa encontrada com os filtros selecionados.</p>';
            return;
        }
        
        const tasksData = [];
        snapshot.forEach(doc => {
            tasksData.push({ id: doc.id, ...doc.data() });
        });
        
        tasksData.sort((a, b) => {
            const clientNameA = allClientsData[a.clientId]?.nome || 'ZZZ';
            const clientNameB = allClientsData[b.clientId]?.nome || 'ZZZ';
            return clientNameA.localeCompare(clientNameB);
        });

        tasksData.forEach(task => {
            const isDone = task.status === 'Feito';
            const clientName = allClientsData[task.clientId]?.nome || "Cliente...";

            container.innerHTML += `
                <div class="flex justify-between items-center p-4 border rounded-md ${isDone ? 'bg-gray-50' : ''}">
                    <div class="flex items-center gap-3 w-full min-w-0">
                        <input type="checkbox" onchange="window.toggleTaskStatus('${task.id}', ${isDone})" ${isDone ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-rocket-yellow-400 focus:ring-rocket-yellow-300 flex-shrink-0">
                        <p class="${isDone ? 'line-through text-gray-500' : 'text-gray-800'} flex-1 truncate" title="${task.descricao}">${task.descricao} <span class="text-xs text-gray-400 whitespace-nowrap">- ${clientName}</span></p>
                    </div>
                    <button onclick="window.handleDeleteClick('tasks', '${task.id}')" class="text-red-600 hover:text-red-800 flex-shrink-0 ml-4"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `;
        });
        renderIcons();
    }, (e) => { handleFriendlyError("Erro ao filtrar tarefas.", e.message, e); });
};

// --- RELATÓRIOS (MÊS ANTERIOR) ---

const loadHistoricalReport = async () => {
    if (!userId || !db) return;
    
    const loadingMsg = document.getElementById('report-loading-msg');
    if (!loadingMsg) return; 
    
    loadingMsg.classList.remove('hidden');
    
    const { start, end } = getLastMonthRange();
    
    let bruto = 0, despesas = 0, novosLeads = 0;
    
    try {
        const salesQuery = query(collection(db, `/artifacts/${appId}/public/data/sales`), 
            where("data", ">=", start), where("data", "<=", end)
        );
        const salesSnapshot = await getDocs(salesQuery);
        salesSnapshot.forEach(doc => { bruto += doc.data().valor || 0; });
        
        const expensesQuery = query(collection(db, `/artifacts/${appId}/public/data/expenses`), 
            where("data", ">=", start), where("data", "<=", end)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        expensesSnapshot.forEach(doc => { despesas += doc.data().valor || 0; });
        
        const prospectsQuery = query(collection(db, `/artifacts/${appId}/public/data/prospects`), 
            where("createdAt", ">=", start), where("createdAt", "<=", end)
        );
        const prospectsSnapshot = await getDocs(prospectsQuery);
        novosLeads = prospectsSnapshot.size;
        
        document.getElementById('report-faturamento-bruto').textContent = formatCurrency(bruto);
        document.getElementById('report-despesas').textContent = formatCurrency(despesas);
        document.getElementById('report-faturamento-liquido').textContent = formatCurrency(bruto - despesas);
        document.getElementById('report-novos-leads').textContent = novosLeads; 
        
    } catch (e) {
        handleFriendlyError("Erro ao carregar relatório histórico", e.message, e);
        document.getElementById('report-faturamento-bruto').textContent = "Erro";
    } finally {
        loadingMsg.classList.add('hidden');
    }
};

 
// --- RELATÓRIO DE FATURAMENTO POR CLIENTE ---

const loadClientRevenueReport = async () => {
    if (!userId || !db) return;

    const container = document.getElementById('client-revenue-list');
    const loadingMsg = document.getElementById('client-revenue-loading');
    
    if (!container || !loadingMsg) return; 

    loadingMsg.classList.remove('hidden');
    container.innerHTML = ''; 

    try {
        const salesQuery = query(collection(db, `/artifacts/${appId}/public/data/sales`));
        const salesSnapshot = await getDocs(salesQuery);
        
        if (salesSnapshot.empty) {
            container.innerHTML = '<p class="text-gray-500">Nenhuma faturação registada ainda.</p>';
            loadingMsg.classList.add('hidden');
            return;
        }
        
        const revenueMap = {};
        salesSnapshot.forEach(doc => {
            const sale = doc.data();
            if (sale.clientId && sale.valor) {
                revenueMap[sale.clientId] = (revenueMap[sale.clientId] || 0) + sale.valor;
            }
        });

        if (Object.keys(revenueMap).length === 0) {
             container.innerHTML = '<p class="text-gray-500">Nenhuma faturação registada ainda.</p>';
             loadingMsg.classList.add('hidden');
             return;
        }

        const sortedRevenue = Object.entries(revenueMap).sort((a, b) => b[1] - a[1]); 

        sortedRevenue.forEach(([clientId, total]) => {
            const clientName = allClientsData[clientId]?.nome || 'Cliente Excluído';
            container.innerHTML += `
                <div class="flex justify-between items-center p-3 border rounded-md hover:bg-gray-50">
                    <p class="font-semibold text-gray-800">${clientName}</p>
                    <p class="font-bold text-gray-900">${formatCurrency(total)}</p>
                </div>
            `;
        });

    } catch (e) {
         handleFriendlyError("Erro ao carregar faturação por cliente", e.message, e);
         container.innerHTML = '<p class="text-red-500">Erro ao carregar relatório.</p>';
    } finally {
        loadingMsg.classList.add('hidden');
    }
};

// Gera o relatório de faturação personalizado
const handleGenerateCustomReport = async () => {
    if (!userId || !db) return;
    
    const period = document.getElementById('reportPeriodSelect').value;
    const dateRange = getReportDateRange(period);
    
    if (period === 'custom' && !dateRange) {
        alert("Por favor, selecione as datas de início e fim.");
        return;
    }
    
    const loadingMsg = document.getElementById('custom-report-loading');
    const resultsContainer = document.getElementById('customReportResults');
    loadingMsg.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    
    const { start, end } = dateRange;
    
    let bruto = 0, despesas = 0, novosLeads = 0;

    try {
        const salesQuery = query(collection(db, `/artifacts/${appId}/public/data/sales`), 
            where("data", ">=", start), where("data", "<=", end)
        );
        const salesSnapshot = await getDocs(salesQuery);
        salesSnapshot.forEach(doc => { bruto += doc.data().valor || 0; });
        
        const expensesQuery = query(collection(db, `/artifacts/${appId}/public/data/expenses`), 
            where("data", ">=", start), where("data", "<=", end)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        expensesSnapshot.forEach(doc => { despesas += doc.data().valor || 0; });
        
        const prospectsQuery = query(collection(db, `/artifacts/${appId}/public/data/prospects`), 
            where("createdAt", ">=", start), where("createdAt", "<=", end)
        );
        const prospectsSnapshot = await getDocs(prospectsQuery);
        novosLeads = prospectsSnapshot.size;
        
        document.getElementById('custom-report-bruto').textContent = formatCurrency(bruto);
        document.getElementById('custom-report-despesas').textContent = formatCurrency(despesas);
        document.getElementById('custom-report-liquido').textContent = formatCurrency(bruto - despesas);
        document.getElementById('custom-report-leads').textContent = novosLeads;
        
        resultsContainer.classList.remove('hidden');

    } catch (e) {
        handleFriendlyError("Erro ao gerar relatório personalizado", e.message, e);
    } finally {
        loadingMsg.classList.add('hidden');
    }
};

// --- MINHA EMPRESA (METAS) ---

const handleGoalsFormSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !db) return;

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const data = {
        faturamento: parseFloat(document.getElementById('goal-faturamento').value) || 0,
        prospeccao: parseInt(document.getElementById('goal-prospeccao').value) || 0,
        ownerId: userId 
    };
    
    try {
        await setDoc(goalsDocRef(), data, { merge: true });
        loadCompanyGoalsPage(); 
    } catch(e) {
        console.error("Erro ao salvar metas:", e);
    } finally {
        submitButton.disabled = false;
    }
};

// --- EXCLUSÃO GENÉRICA (MODAL) ---

window.handleDeleteClick = (collectionName, docId) => {
    let data = null; 
    if (collectionName === 'clients') {
         document.getElementById('deleteModalText').textContent = "Tem certeza? Excluir um cliente também excluirá TODOS os seus pagamentos, tarefas e senhas associados. Esta ação é irreversível.";
    } else {
         document.getElementById('deleteModalText').textContent = "Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.";
    }
    
    if (collectionName !== 'prospects-convert') {
         currentDeleteInfo = { collectionName, docId, data: null };
         showModal('deleteModal');
    }
};

const handleConfirmDelete = async () => {
    if (!currentDeleteInfo || !userId || !db) return;
    
    const { collectionName, docId, data } = currentDeleteInfo;
    
    try {
        if (collectionName === 'clients') {
            // Excluir Cliente e todos os sub-dados
            const batch = writeBatch(db);
            
            batch.delete(doc(db, `/artifacts/${appId}/public/data/clients/${docId}`));
            
            const subCollections = ['payments', 'tasks', 'credentials', 'sales', 'expenses']; 
            for (const subCol of subCollections) {
                let subColPath = `/artifacts/${appId}/public/data/${subCol}`;
                const q = query(collection(db, subColPath), where("clientId", "==", docId));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => batch.delete(doc.ref));
            }
            
            await batch.commit();
            
            if (currentClientId === docId) {
                showPage('clientsPage');
            }
        } else if (collectionName === 'prospects-convert') {
            // Converter Prospect para Cliente
            document.getElementById('conversionSource').value = 'prospect';
            hideModal('prospectDetailModal'); 
            await openClientModal(null, data); 
            await deleteDoc(doc(db, `/artifacts/${appId}/public/data/prospects/${docId}`)); 
        
        } else {
            // Exclusão simples (payments, tasks, credentials, prospects, expenses)
            let docPath = `/artifacts/${appId}/public/data/${collectionName}/${docId}`;
            await deleteDoc(doc(db, docPath));
        }
        
        hideModal('deleteModal');
        currentDeleteInfo = null;
        
    } catch (e) {
        console.error("Erro ao excluir/converter:", e);
        hideModal('deleteModal');
        currentDeleteInfo = null;
    }
};


// --- INICIALIZAÇÃO DOS EVENT LISTENERS ---

const initEventListeners = () => {
    
    if (document.body.dataset.listenersAttached === 'true') {
        return;
    }
    document.body.dataset.listenersAttached = 'true';
    
    // Navegação (Sidebar e Voltar)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const pageId = e.currentTarget.dataset.page;
            if (pageId === 'clientsPage') {
                currentClientId = null;
            }
            showPage(pageId);
        });
    });

    // Modais de Cliente
    document.getElementById('showAddClientModalBtn').addEventListener('click', () => openClientModal());
    document.getElementById('editClientBtn').addEventListener('click', () => openClientModal(currentClientId));
    document.getElementById('closeClientModalBtn').addEventListener('click', () => hideModal('clientModal'));
    document.getElementById('clientForm').addEventListener('submit', handleClientFormSubmit);
    document.getElementById('clientPaymentTypeInput').addEventListener('change', (e) => {
        const installmentsInput = document.getElementById('clientInstallmentsInput');
        const isParcelado = e.target.value === 'parcelado';
        installmentsInput.disabled = !isParcelado;
        installmentsInput.required = isParcelado;
        if (!isParcelado) installmentsInput.value = '';
    });

    // Modais de Prospect (Adicionar)
    document.getElementById('showAddProspectModalBtn').addEventListener('click', () => {
        renderServicesCheckboxes('prospectServicesCheckboxes');
        showModal('prospectModal');
    });
    document.getElementById('closeProspectModalBtn').addEventListener('click', () => hideModal('prospectModal'));
    document.getElementById('prospectForm').addEventListener('submit', handleAddProspectFormSubmit);
    
    // NOVO: Listeners do "Super-Modal" de Prospect (Detalhes)
    document.getElementById('prospectDetailForm').addEventListener('submit', handleProspectDetailFormSubmit);
    document.getElementById('closeProspectDetailModalBtn').addEventListener('click', () => hideModal('prospectDetailModal'));
    document.getElementById('deleteProspectBtn').addEventListener('click', () => {
        hideModal('prospectDetailModal');
        handleDeleteClick('prospects', currentProspectId);
    });
    document.getElementById('convertProspectBtn').addEventListener('click', () => {
         window.convertProspectToClient(currentProspectId);
    });
    
    // NOVO: Listeners das Abas do Super-Modal
    document.querySelectorAll('.modal-tab-link').forEach(link => {
        link.addEventListener('click', (e) => {
            switchTab(e.currentTarget.dataset.tab, '.modal-tab-link', '.modal-tab-content');
            renderIcons(); // Renderiza ícones caso a aba de IA os tenha
        });
    });
    
    // NOVO: Listener do Form de Comentários
    document.getElementById('addProspectNoteForm').addEventListener('submit', handleAddProspectNoteSubmit);

    // NOVO: Listeners da IA (Gemini)
    document.getElementById('generateGeminiAnalysisBtn').addEventListener('click', handleGeminiAnalysis);
    document.getElementById('geminiApiKeyInput').addEventListener('change', handleApiKeySave);


    // Abas (Detalhe Cliente)
    document.querySelectorAll('.tab-link').forEach(link => {
        link.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, '.tab-link', '.tab-content'));
    });

    // Abas (Contas a Receber)
    document.querySelectorAll('.finance-tab-link').forEach(link => {
        link.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, '.finance-tab-link', '.finance-tab-content'));
    });

    // Forms de Detalhe Cliente
    document.getElementById('addPaymentForm').addEventListener('submit', handleAddPaymentSubmit);
    document.getElementById('addTaskForm').addEventListener('submit', handleAddTaskSubmit);
    document.getElementById('addCredentialForm').addEventListener('submit', handleAddCredentialSubmit);
    
    // Form de Despesa
    document.getElementById('addExpenseForm').addEventListener('submit', handleExpenseFormSubmit);

    // Filtros de Tarefas Globais
    document.getElementById('globalTaskClientFilter').addEventListener('change', applyGlobalTaskFilters);
    document.getElementById('globalTaskStatusFilter').addEventListener('change', applyGlobalTaskFilters);

    // Form de Metas
    document.getElementById('goalsForm').addEventListener('submit', handleGoalsFormSubmit);

    // Modal de Exclusão
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        currentDeleteInfo = null;
        hideModal('deleteModal');
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', handleConfirmDelete);
    
    // Listeners do Filtro de Relatório
    document.getElementById('reportPeriodSelect').addEventListener('change', (e) => {
        const customRange = document.getElementById('customDateRange');
        customRange.classList.toggle('hidden', e.target.value !== 'custom');
        customRange.classList.toggle('md:flex', e.target.value === 'custom');
    });
    document.getElementById('generateCustomReportBtn').addEventListener('click', handleGenerateCustomReport);

};

// --- INICIALIZAÇÃO DA PÁGINA ---
window.addEventListener('load', () => {
    renderIcons(); 
    
    // Listeners do Menu Mobile (Delegação)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#mobileMenuBtn')) {
            document.getElementById('mobileMenu').classList.remove('hidden');
            renderIcons();
        }
        if (e.target.closest('#closeMobileMenuBtn')) {
            document.getElementById('mobileMenu').classList.add('hidden');
        }
    });
});
// Fim do ficheiro app.js
