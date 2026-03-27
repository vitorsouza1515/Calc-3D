// ==========================================
// 1. INICIALIZAÇÃO, SERVICE WORKER E UI
// ==========================================

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(reg => console.log('PWA Registrado')).catch(err => console.log('Erro PWA', err)); }); }
window.onclick = function(event) { if (event.target.classList.contains('modal')) { window.fecharModal(event.target.id); } };
document.addEventListener('keydown', function(event) { if (event.key === "Escape") { document.querySelectorAll('.modal').forEach(function(modal) { if (modal.style.display === 'block') { window.fecharModal(modal.id); } }); fecharGaveta(); } });
window.abrirGaveta = function() { document.getElementById('sideMenu').classList.add('open'); document.getElementById('menuOverlay').classList.add('open'); }
window.fecharGaveta = function() { document.getElementById('sideMenu').classList.remove('open'); document.getElementById('menuOverlay').classList.remove('open'); }
function showToast(msg, isError = false) { var t = document.getElementById("toast"); if(t) { t.textContent = msg; t.style.background = isError ? "var(--danger)" : "var(--primary)"; t.className = "show"; setTimeout(() => t.className = "", 2500); } }

// ==========================================
// 2. FIREBASE, LOGIN E SINCRONIZAÇÃO
// ==========================================

const firebaseConfig = { apiKey: "AIzaSyBHP744_ct0YNtEWT_s33Wpfv7udS9gSOg", authDomain: "calculadora-3d-ed2c7.firebaseapp.com", projectId: "calculadora-3d-ed2c7", storageBucket: "calculadora-3d-ed2c7.firebasestorage.app", messagingSenderId: "577875133404", appId: "1:577875133404:web:d12015947e7c9fc19a8519" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();
db.enablePersistence().catch(function(err) { console.log("Offline indisponível:", err.code); });
const auth = firebase.auth(); let nuvemRef = null; let unsubscribeSnapshot = null;

auth.onAuthStateChanged(user => {
    document.getElementById('loading-screen').style.display = 'none';
    if (user) { document.getElementById('login-screen').style.display = 'none'; document.getElementById('btnSair').style.display = 'inline-block'; nuvemRef = db.collection("workspaces_3d4you").doc(user.uid); iniciarApp(); } 
    else { document.getElementById('login-screen').style.display = 'flex'; document.getElementById('btnSair').style.display = 'none'; if (unsubscribeSnapshot) unsubscribeSnapshot(); }
});

window.fazerLogin = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return; document.getElementById('loading-screen').style.display = 'flex'; auth.signInWithEmailAndPassword(email, senha).catch(error => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('loginError').textContent = "Erro: " + error.message; document.getElementById('loginError').style.display = 'block'; }); };
window.criarConta = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return showToast("❌ Preencha e-mail e senha!", true); document.getElementById('loading-screen').style.display = 'flex'; auth.createUserWithEmailAndPassword(email, senha).then(() => { showToast("✅ Conta criada!"); }).catch(error => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('loginError').textContent = "Erro: " + error.message; document.getElementById('loginError').style.display = 'block'; }); };
window.fazerLogout = function() { if(confirm("Deseja sair?")) { auth.signOut(); location.reload(); } };

// ==========================================
// 3. VARIÁVEIS GLOBAIS E ESTADO
// ==========================================

var historico = [], estoque = [], catalogo = [], despesas = [], carrinho = [];
var editEstoqueId = null, editCatalogoId = null, editHistoricoId = null, editDespesaId = null, editandoCarrinhoId = null, filtroStatusAtual = 'Todos', clientesCadastrados = {};
window.qaOffset = 0; window.horasTotaisImpressasGlobal = 0; window.oldBaseVals = {};
window.configGlobais = { maquina: "3.275", vidaUtil: "3.000", consumoW: "350", precoKwh: "1,20", qa_aviso: "100", custoEmbalagem: "0,00", custoDeslocamento: "0,00", taxaMeli: "17", fixaMeli: "6,75", taxaSucesso: "80", margemLucro: "80" };

// ==========================================
// 4. INTEGRAÇÃO IMGBB (UPLOAD DE FOTOS)
// ==========================================

window.uploadingCatalogId = null;
window.handleUploadCat = function(input) {
    var file = input.files[0]; if (!file) return; var formData = new FormData(); formData.append("image", file);
    document.getElementById('loading-screen').style.display = 'flex'; var h2 = document.getElementById('loading-screen').querySelector('h2'), oldText = h2.textContent; h2.textContent = "A anexar foto...";
    fetch("https://api.imgbb.com/1/upload?key=50b2518403427e60b75a8074dc495b15", { method: "POST", body: formData }).then(r => r.json()).then(data => {
        document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText;
        if (data.success) { var url = data.data.display_url; document.getElementById('fotoUrlCat').value = url; var prev = document.getElementById('previewFotoCat'); prev.style.backgroundImage = `url('${url}')`; prev.style.display = "block"; document.getElementById('btnRemoverFotoCat').style.display = "block"; showToast("📸 Foto pronta para salvar!"); } else { showToast("❌ Erro no upload", true); } input.value = "";
    }).catch(() => { document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText; showToast("❌ Erro de rede", true); input.value = ""; });
};
window.removerFotoCat = function() { var f = document.getElementById('fotoUrlCat'); if(f) f.value = ""; var p = document.getElementById('previewFotoCat'); if(p) { p.style.display = "none"; p.style.backgroundImage = "none"; } var b = document.getElementById('btnRemoverFotoCat'); if(b) b.style.display = "none"; };

// ==========================================
// 5. FUNÇÕES UTILITÁRIAS E SINCRONIZAÇÃO
// ==========================================

window.toggleCard = function(id, el, event) { if(event && (event.target.tagName === 'INPUT' || event.target.classList.contains('slider-switch') || event.target.classList.contains('switch') || event.target.tagName === 'BUTTON')) return; var content = document.getElementById(id), chevron = el.querySelector('.chevron'); if(content.style.display === 'none') { content.style.display = 'block'; if(chevron) chevron.style.transform = 'rotate(0deg)'; } else { content.style.display = 'none'; if(chevron) chevron.style.transform = 'rotate(-90deg)'; } };
function atualizarListaClientes() { clientesCadastrados = {}; historico.forEach(function(item) { if (item.cliente && item.cliente.trim() !== '') { if (!clientesCadastrados[item.cliente] && item.telefone) { clientesCadastrados[item.cliente] = item.telefone; } } }); var dl = document.getElementById('listaClientes'); if (dl) { dl.innerHTML = ''; for (var c in clientesCadastrados) { dl.innerHTML += `<option value="${c}">`; } } }
function checarClienteAutoFill() { var nome = document.getElementById('nomeCliente').value; if (clientesCadastrados[nome]) { document.getElementById('telefoneCliente').value = clientesCadastrados[nome]; salvarDinamico('telefoneCliente'); } }

function iniciarApp() {
    unsubscribeSnapshot = nuvemRef.onSnapshot(function(doc) {
        if (doc.exists) {
            var data = doc.data(); historico = data.historico || []; estoque = data.estoque || []; catalogo = data.catalogo || []; despesas = data.despesas || []; window.qaOffset = data.qaOffset || 0; window.configGlobais = data.configGlobais || window.configGlobais;
            atualizarListaClientes(); document.getElementById('maquina').value = window.configGlobais.maquina || "3.275"; document.getElementById('vidaUtil').value = window.configGlobais.vidaUtil || "3.000"; document.getElementById('consumoW').value = window.configGlobais.consumoW || "350"; document.getElementById('precoKwh').value = window.configGlobais.precoKwh || "1,20"; document.getElementById('qa_aviso').value = window.configGlobais.qa_aviso || "100"; document.getElementById('custoEmbalagem').value = window.configGlobais.custoEmbalagem || "0,00"; document.getElementById('custoDeslocamento').value = window.configGlobais.custoDeslocamento || "0,00"; document.getElementById('taxaMeli').value = window.configGlobais.taxaMeli || "17"; document.getElementById('fixaMeli').value = window.configGlobais.fixaMeli || "6,75"; document.getElementById('taxaSucesso').value = window.configGlobais.taxaSucesso || "80"; document.getElementById('margemInput').value = window.configGlobais.margemLucro || "80";
            let elMargemSlider = document.getElementById('margemSlider'); if(elMargemSlider) { elMargemSlider.value = pegaValor('margemInput'); updateSliderProgress(elMargemSlider); } let precisaSalvarNuven = false; historico.forEach(h => { if ((h.custo === 0 || isNaN(h.custo)) && h.status !== 'Orçamento' && h.status !== 'Devolução') { let hrs = parseLocal(h.tempo) || 0, grm = parseLocal(h.peso) || 0; if (hrs > 0 || grm > 0) { let dep = (pegaValor('maquina') / (pegaValor('vidaUtil') || 1)) * hrs, ene = (pegaValor('consumoW') / 1000) * pegaValor('precoKwh') * hrs, mat = (120 / 1000) * grm; h.custo = dep + ene + mat; precisaSalvarNuven = true; } } }); if(precisaSalvarNuven) syncNuvem(); renderHistorico(); renderEstoque(); renderCatalogo(); renderDespesas(); atualizarDropdownsEstoque(); calcular(); 
        } else { nuvemRef.set({ historico: [], estoque: [], catalogo: [], despesas: [], qaOffset: 0, configGlobais: window.configGlobais }); }
    });
}

function syncNuvem() { window.configGlobais = { maquina: pegaTexto('maquina') || "3.275", vidaUtil: pegaTexto('vidaUtil') || "3.000", consumoW: pegaTexto('consumoW') || "350", precoKwh: pegaTexto('precoKwh') || "1,20", qa_aviso: pegaTexto('qa_aviso') || "100", custoEmbalagem: pegaTexto('custoEmbalagem') || "0,00", custoDeslocamento: pegaTexto('custoDeslocamento') || "0,00", taxaMeli: pegaTexto('taxaMeli') || "17", fixaMeli: pegaTexto('fixaMeli') || "6,75", taxaSucesso: pegaTexto('taxaSucesso') || "80", margemLucro: pegaTexto('margemInput') || "80" }; if(nuvemRef) { nuvemRef.set({ historico: historico, estoque: estoque, catalogo: catalogo, despesas: despesas, qaOffset: window.qaOffset || 0, configGlobais: window.configGlobais }).catch(function(error) { showToast("❌ Erro ao Sincronizar Nuvem", true); }); } }

// ==========================================
// 6. FUNÇÕES DE FORMATAÇÃO E MÁSCARAS
// ==========================================

function aplicarMascara(el) { if (!el) return; var start = el.selectionStart, oldVal = el.value, partsDot = oldVal.split('.'); if (partsDot.length === 2 && oldVal.indexOf(',') === -1 && partsDot[1].length <= 3) { oldVal = oldVal.replace('.', ','); } var v = oldVal.replace(/\./g, '').replace(/[^0-9,]/g, ''), parts = v.split(','); if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join(''); var intPart = parts[0]; if (intPart) { if (intPart.length > 1 && intPart.charAt(0) === '0') { intPart = parseInt(intPart, 10).toString(); } intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "."); } var newVal = parts.length > 1 ? intPart + ',' + parts[1] : intPart; if (el.value !== newVal) { el.value = newVal; var newStart = start + (newVal.length - oldVal.length); if (newStart < 0) newStart = 0; try { el.setSelectionRange(newStart, newStart); } catch(e) {} } }
function mascaraTelefone(el) { if (!el) return; var val = el.value.replace(/\D/g, ''); if (val.length > 11) val = val.slice(0, 11); if (val.length > 2) val = '(' + val.slice(0,2) + ') ' + val.slice(2); if (val.length > 10) val = val.slice(0, 10) + '-' + val.slice(10); el.value = val; }
function formatarMoeda(num) { var n = parseFloat(num); if (isNaN(n)) return "0,00"; return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pegaValor(id) { var el = document.getElementById(id); if (!el || !el.value) return 0; return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0; }
function pegaTexto(id) { var el = document.getElementById(id); if (el) { return el.value || ''; } return ''; }
function parseLocal(val) { if (val === undefined || val === null || val === '') return 0; if (typeof val === 'number') return val; var str = val.toString(); if (str.includes(',') && str.includes('.')) { return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0; } if (str.includes(',')) { return parseFloat(str.replace(',', '.')) || 0; } return parseFloat(str) || 0; }
function salvarDinamico(idCampo) { var el = document.getElementById(idCampo); if (el) { localStorage.setItem('3d4y_dark_' + idCampo, el.value); } }
function salvarDinamicoValor(idCampo, valor) { var el = document.getElementById(idCampo); if (el) el.value = valor; localStorage.setItem('3d4y_dark_' + idCampo, valor); }
var dynIds = ['nomeProjeto', 'nomeCliente', 'telefoneCliente', 'pesoPeca', 'tempoH', 'valorPersonalizado', 'tipoFilamento1', 'corFilamento1', 'marcaFilamento1', 'qtdPecasProjeto', 'precoFixoCatMain', 'fotoUrlProjeto'];
function updateSliderProgress(slider) { if (!slider) return; var value = (slider.value - slider.min) / (slider.max - slider.min) * 100; slider.style.background = 'linear-gradient(to right, #3b82f6 ' + value + '%, #334155 ' + value + '%)'; }

// ==========================================
// 7. MODAIS E CONFIGURAÇÕES
// ==========================================

window.abrirConfigModal = function() { window.oldBaseVals = { maq: pegaValor('maquina'), vid: pegaValor('vidaUtil'), con: pegaValor('consumoW'), kwh: pegaValor('precoKwh') }; document.getElementById('configModal').style.display='block'; }
window.fecharModal = function(idModal) {
    document.getElementById(idModal).style.display = 'none';
    if (idModal === 'catalogoModal') { document.getElementById('boxEditCat').style.display = 'none'; window.removerFotoCat(); }
    if (idModal === 'configModal') { var nMaq = pegaValor('maquina'), nVid = pegaValor('vidaUtil'), nCon = pegaValor('consumoW'), nKwh = pegaValor('precoKwh'); if (nMaq > 0 && nVid > 0 && (nMaq !== window.oldBaseVals.maq || nVid !== window.oldBaseVals.vid || nCon !== window.oldBaseVals.con || nKwh !== window.oldBaseVals.kwh)) { if(confirm("⚠️ Você alterou dados de Custo Operacional.\n\n[ OK ] Atualiza TODAS as vendas do histórico com o novo custo.\n[ CANCELAR ] O novo custo valerá apenas para as próximas vendas novas.")) { var oldDep = window.oldBaseVals.maq / (window.oldBaseVals.vid || 1), oldEne = (window.oldBaseVals.con / 1000) * window.oldBaseVals.kwh, newDep = nMaq / (nVid || 1), newEne = (nCon / 1000) * nKwh, deltaPorHora = (newDep + newEne) - (oldDep + oldEne); if (!isNaN(deltaPorHora) && isFinite(deltaPorHora)) { historico.forEach(h => { var hTempo = parseLocal(h.tempo) || 0; h.custo = (parseLocal(h.custo) || 0) + (deltaPorHora * hTempo); if(h.custo < 0) h.custo = 0; if(h.cartItems) { h.cartItems.forEach(ci => { var ciTempo = parseLocal(ci.tempo) || 0; ci.custo = (parseLocal(ci.custo) || 0) + (deltaPorHora * ciTempo); if(ci.custo < 0) ci.custo = 0; }); } }); showToast("✅ Passado Atualizado com Sucesso!"); } } } }
    if (idModal === 'logisticaModal') { var nEmb = pegaValor('custoEmbalagem'), nDes = pegaValor('custoDeslocamento'), oldEmb = parseLocal(window.configGlobais.custoEmbalagem || "0"), oldDes = parseLocal(window.configGlobais.custoDeslocamento || "0"); if (nEmb !== oldEmb || nDes !== oldDes) { if(confirm("⚠️ Você alterou os custos Fixos de Logística.\n\n[ OK ] Atualiza TODAS as vendas já feitas no histórico.\n[ CANCELAR ] O novo custo valerá apenas a partir de agora.")) { historico.forEach(h => { var novoLog = nEmb + nDes, deltaLogistica = novoLog - parseLocal(h.logistica || 0); h.logistica = novoLog; h.valorLiquido = (parseLocal(h.valorLiquido) || 0) - deltaLogistica; if (h.valorLiquido < 0) h.valorLiquido = 0; }); showToast("✅ Logística Atualizada no Histórico!"); } } }
    syncNuvem(); renderHistorico(); calcular();
}

window.resetarQA = function() { if(confirm("Confirma que você acabou de realizar a manutenção/lubrificação da máquina?")) { window.qaOffset = window.horasTotaisImpressasGlobal; syncNuvem(); renderHistorico(); document.getElementById('configModal').style.display='none'; showToast("🔧 Manutenção Registrada e Zerada!"); } }

// MÁGICA DO ARREDONDAMENTO ITEM A ITEM
function descontarTaxas(valorBruto, qtdTotal, cartItemsArray) { 
    var feeShpTotal = 0, feeMlTotal = 0, txMl = pegaValor('taxaMeli') / 100;
    var items = (cartItemsArray && cartItemsArray.length > 0) ? cartItemsArray : (carrinho && carrinho.length > 0 ? carrinho : []);
    var isCart = items.length > 0;
    
    if (isCart) {
        var cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento');
        var totBaseForRatio = items.reduce((a,b)=>a + parseLocal(b.valorComLucro || 0), 0) || 1;
        var simulatedGrossList = [];
        var totalSimulatedGross = 0;
        
        items.forEach(i => {
            var iQtd = parseLocal(i.qtd || 1);
            var iValLucro = parseLocal(i.valorComLucro || 0);
            var iPrecoExato = parseLocal(i.precoVendaExato || 0);

            if (iPrecoExato > 0) {
                simulatedGrossList.push(iPrecoExato / iQtd);
                totalSimulatedGross += iPrecoExato;
            } else {
                var itemRatio = iValLucro / totBaseForRatio;
                var itemBaseTotal = iValLucro + (cLog * itemRatio);
                var itemBaseUnit = itemBaseTotal / iQtd;
                var p1 = (itemBaseUnit + 4) / 0.80, p2 = (itemBaseUnit + 16) / 0.86, p3 = (itemBaseUnit + 20) / 0.86, p4 = (itemBaseUnit + 26) / 0.86, bestPShp;
                if (p1 <= 79.991) bestPShp = p1; else if (p2 <= 99.991) bestPShp = p2; else if (p3 <= 199.991) bestPShp = p3; else bestPShp = p4;
                
                var unitGross = Math.round(bestPShp * 100) / 100;
                simulatedGrossList.push(unitGross);
                totalSimulatedGross += (unitGross * iQtd);
            }
        });

        var scale = parseLocal(valorBruto) / (totalSimulatedGross || 1);
        
        items.forEach((i, idx) => {
            var iQtd = parseLocal(i.qtd || 1);
            var actualUnitGross = Math.round((simulatedGrossList[idx] * scale) * 100) / 100;
            
            var feeSUnit = 0;
            if (actualUnitGross <= 79.991) feeSUnit = (Math.round(actualUnitGross * 0.20 * 100) / 100) + 4;
            else if (actualUnitGross <= 99.991) feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 16;
            else if (actualUnitGross <= 199.991) feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 20;
            else feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 26;
            
            feeShpTotal += (feeSUnit * iQtd);
            
            var fixMl = (actualUnitGross >= 79.99) ? 0 : pegaValor('fixaMeli');
            var feeMUnit = (Math.round(actualUnitGross * txMl * 100) / 100) + fixMl;
            feeMlTotal += (feeMUnit * iQtd);
        });
    } else {
        var avgBruto = Math.round((parseLocal(valorBruto) / parseLocal(qtdTotal)) * 100) / 100;
        var feeShpUnit = 0;
        
        if (avgBruto <= 79.991) feeShpUnit = (Math.round(avgBruto * 0.20 * 100) / 100) + 4;
        else if (avgBruto <= 99.991) feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 16;
        else if (avgBruto <= 199.991) feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 20;
        else feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 26;
        
        feeShpTotal = feeShpUnit * parseLocal(qtdTotal);
        
        var fixMl = (avgBruto >= 79.99) ? 0 : pegaValor('fixaMeli');
        var feeMlUnit = (Math.round(avgBruto * txMl * 100) / 100) + fixMl;
        feeMlTotal = feeMlUnit * parseLocal(qtdTotal);
    }
    
    var netShopee = parseLocal(valorBruto) - feeShpTotal; if (netShopee < 0) netShopee = 0;
    var netMeli = parseLocal(valorBruto) - feeMlTotal; if (netMeli < 0) netMeli = 0;
    
    return { shopee: netShopee, meli: netMeli }; 
}

// ==========================================
// 8. LIMPEZA E PREENCHIMENTO DO PROJETO
// ==========================================

function limparFantasmasMultiCor() {
    for(var i = 2; i <= 15; i++) {
        localStorage.removeItem('3d4y_dark_tipoFilamento' + i);
        localStorage.removeItem('3d4y_dark_corFilamento' + i);
        localStorage.removeItem('3d4y_dark_marcaFilamento' + i);
        localStorage.removeItem('3d4y_dark_precoFilamento' + i);
        localStorage.removeItem('3d4y_dark_pesoPeca' + i);
    }
    var qCores = document.getElementById('qtdCoresExtras');
    if (qCores) qCores.value = "1";
    if(typeof renderCoresExtras === 'function') renderCoresExtras();
}

function resetarInputProjeto() {
    document.getElementById('nomeProjeto').value = ""; document.getElementById('qtdPecasProjeto').value = "1"; document.getElementById('tempoH').value = ""; document.getElementById('pesoPeca').value = ""; 
    var sel1 = document.getElementById('sel_est_1'); if(sel1) sel1.value = ""; 
    document.getElementById('tipoFilamento1').value = ""; document.getElementById('corFilamento1').value = ""; document.getElementById('marcaFilamento1').value = ""; document.getElementById('precoFilamento').value = "120,00"; document.getElementById('detalhes_1').style.display = 'none'; 
    var tMulti = document.getElementById('toggle_multi_mat'); 
    if(tMulti && tMulti.checked) { tMulti.checked = false; tMulti.dispatchEvent(new Event('change')); } 
    document.getElementById('fotoUrlProjeto').value = ""; var prev = document.getElementById('previewFotoMain'); if(prev) prev.style.display = "none"; 
    
    ['nomeProjeto', 'qtdPecasProjeto', 'tempoH', 'pesoPeca', 'tipoFilamento1', 'corFilamento1', 'marcaFilamento1', 'precoFilamento', 'precoFixoCatMain', 'fotoUrlProjeto'].forEach(id => localStorage.removeItem('3d4y_dark_' + id)); 
    
    limparFantasmasMultiCor();
}

function preencherFormProjeto(prod) {
    var match = prod.nome.match(/^(\d+)x\s(.*)/), qtd = match ? parseInt(match[1]) : (prod.qtd || 1), baseNome = match ? match[2] : prod.nome; document.getElementById('nomeProjeto').value = baseNome; document.getElementById('qtdPecasProjeto').value = qtd; var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === baseNome.toLowerCase().trim()), selCat = document.getElementById('sel_catalogo'); if(matchCat) { if(selCat) selCat.value = matchCat.id.toString(); } else { if(selCat) selCat.value = ""; }
    var p_tipo1 = prod.tipo1 || (matchCat ? matchCat.tipo1 : ""), p_cor1 = prod.cor1 || (matchCat ? matchCat.cor1 : ""), p_marca1 = prod.marca1 || (matchCat ? matchCat.marca1 : ""), p_preco1 = prod.preco1 || (matchCat ? matchCat.preco1 : "120,00"), p_multi = prod.multi !== undefined ? prod.multi : (matchCat ? matchCat.multi : false), p_qtdCores = prod.qtdCores || (matchCat ? matchCat.qtdCores : "1"), p_extras = prod.extras || (matchCat ? matchCat.extras : []);
    document.getElementById('tempoH').value = prod.tempo1 || (prod.tempo ? formatarMoeda((prod.tempo) / qtd) : (matchCat ? matchCat.tempo : "")); document.getElementById('pesoPeca').value = prod.peso1 || (prod.peso ? formatarMoeda((prod.peso) / qtd) : (matchCat ? matchCat.peso1 : "")); if (prod.taxaSucesso) document.getElementById('taxaSucesso').value = prod.taxaSucesso; if (prod.margemLucro) { document.getElementById('margemInput').value = prod.margemLucro; document.getElementById('margemSlider').value = prod.margemLucro; updateSliderProgress(document.getElementById('margemSlider')); }
    document.getElementById('tipoFilamento1').value = p_tipo1; document.getElementById('corFilamento1').value = p_cor1; document.getElementById('marcaFilamento1').value = p_marca1; document.getElementById('precoFilamento').value = p_preco1; var match1 = null; if(p_tipo1) { match1 = estoque.find(e => e.tipo === p_tipo1 && e.cor === p_cor1 && e.marca === p_marca1) || estoque.find(e => e.tipo === p_tipo1 && e.cor === p_cor1); } var sel1 = document.getElementById('sel_est_1'); if(match1) { if(sel1) sel1.value = match1.id.toString(); document.getElementById('marcaFilamento1').value = match1.marca; document.getElementById('precoFilamento').value = match1.preco; } else { if(sel1) sel1.value = ""; } document.getElementById('detalhes_1').style.display = (p_tipo1) ? 'block' : 'none';
    var fotoUrl = prod.foto || (matchCat ? matchCat.foto : ""); document.getElementById('fotoUrlProjeto').value = fotoUrl; salvarDinamico('fotoUrlProjeto'); var preview = document.getElementById('previewFotoMain'); if (fotoUrl) { preview.style.backgroundImage = `url('${fotoUrl}')`; preview.style.display = "block"; } else { preview.style.display = "none"; }
    
    limparFantasmasMultiCor(); 
    
    var tMulti = document.getElementById('toggle_multi_mat'); if(tMulti) { tMulti.checked = p_multi; tMulti.dispatchEvent(new Event('change')); } 
    if(p_multi && p_extras && p_extras.length > 0) { 
        document.getElementById('qtdCoresExtras').value = p_qtdCores; 
        p_extras.forEach((ex, idx) => { var i = idx + 2; salvarDinamicoValor('tipoFilamento'+i, ex.tipo || ""); salvarDinamicoValor('corFilamento'+i, ex.cor || ""); salvarDinamicoValor('marcaFilamento'+i, ex.marca || ""); salvarDinamicoValor('precoFilamento'+i, ex.preco || ""); salvarDinamicoValor('pesoPeca'+i, ex.peso || ""); }); 
        renderCoresExtras(); 
        p_extras.forEach((ex, idx) => { var i = idx + 2; setTimeout(() => { var matchI = null; if(ex.tipo) { matchI = estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor && e.marca === ex.marca) || estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor); } var selI = document.getElementById('sel_est_'+i); if(matchI) { if(selI) selI.value = matchI.id.toString(); document.getElementById('precoFilamento'+i).value = matchI.preco; document.getElementById('marcaFilamento'+i).value = matchI.marca; } else { if(selI) selI.value = ""; } }, 50); }); 
    } else { 
        if(document.getElementById('qtdCoresExtras')) document.getElementById('qtdCoresExtras').value = "1"; renderCoresExtras(); 
    } 
    ['nomeProjeto','qtdPecasProjeto','tempoH','pesoPeca'].forEach(id => salvarDinamico(id)); calcular();
}
// ==========================================
// 9. CARRINHO DE COMPRAS
// ==========================================

function adicionarAoCarrinho() {
    var nomeBase = pegaTexto('nomeProjeto') || "Sem Nome", qtdPecas = parseInt(pegaValor('qtdPecasProjeto')) || 1; if(qtdPecas < 1) qtdPecas = 1; var nomeItem = qtdPecas > 1 ? qtdPecas + "x " + nomeBase : nomeBase, tMulti = document.getElementById('toggle_multi_mat'), multiMatEnabled = tMulti ? tMulti.checked : false, tempoItem = pegaValor('tempoH') * qtdPecas, pesoItem = pegaValor('pesoPeca') * qtdPecas, depCalc = (pegaValor('maquina') / (pegaValor('vidaUtil') || 1)) * tempoItem, eneCalc = (pegaValor('consumoW') / 1000) * pegaValor('precoKwh') * tempoItem, precoMatCalc = pegaValor('precoFilamento'); if(precoMatCalc === 0) precoMatCalc = 120;
    var matTotalCalc = (precoMatCalc / 1000) * pesoItem, materiaisArray = [], t1 = pegaTexto('tipoFilamento1'), c1 = pegaTexto('corFilamento1'), m1 = pegaTexto('marcaFilamento1'), nomeMat1 = (t1 + ' ' + c1 + ' ' + m1).trim(); if (nomeMat1 === '') nomeMat1 = 'Filamento 1'; if(pesoItem > 0) materiaisArray.push(nomeMat1 + ' (' + pesoItem + 'g)'); var extras = [];
    if (multiMatEnabled) { var qtdEx = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i = 2; i <= qtdEx + 1; i++) { var pesoE = pegaValor('pesoPeca'+i) * qtdPecas; pesoItem += pesoE; var precoE = pegaValor('precoFilamento' + i); if(precoE === 0) precoE = 120; matTotalCalc += (precoE / 1000) * pesoE; var ti = pegaTexto('tipoFilamento'+i), ci = pegaTexto('corFilamento'+i), mi = pegaTexto('marcaFilamento'+i), nomeMatI = (ti + ' ' + ci + ' ' + mi).trim(); if (nomeMatI === '') nomeMatI = 'Filamento ' + i; if(pesoE > 0) materiaisArray.push(nomeMatI + ' (' + pesoE + 'g)'); extras.push({ tipo: ti, cor: ci, marca: mi, preco: pegaTexto('precoFilamento'+i), peso: pegaTexto('pesoPeca'+i) }); } }
    var sucCalc = pegaValor('taxaSucesso'); if (sucCalc <= 0) sucCalc = 100; var custoItemCalc = (depCalc + eneCalc + matTotalCalc) / (sucCalc / 100), mInputCalc = pegaValor('margemInput'), vDCalc = custoItemCalc + (custoItemCalc * (mInputCalc / 100));
    
    var canalSel = document.getElementById('canalVendaSelecionado');
    var isPerso = canalSel && canalSel.value === 'Personalizado';
    var valPerso = pegaValor('valorPersonalizado');
    var precoExatoItem = (isPerso && valPerso > 0) ? parseLocal(valPerso) : 0;
    
    var novoItem = { id: editandoCarrinhoId ? editandoCarrinhoId : Date.now() + Math.floor(Math.random() * 1000), nome: nomeItem, qtd: qtdPecas, custo: custoItemCalc, valorComLucro: vDCalc, precoVendaExato: precoExatoItem, tempo: tempoItem, peso: pesoItem, materiais: (materiaisArray.length > 0 ? materiaisArray.join(' + ') : 'Não informado'), tipo1: t1, cor1: c1, marca1: m1, preco1: document.getElementById('precoFilamento').value, peso1: document.getElementById('pesoPeca').value, tempo1: document.getElementById('tempoH').value, multi: multiMatEnabled, qtdCores: document.getElementById('qtdCoresExtras') ? document.getElementById('qtdCoresExtras').value : "1", extras: extras, taxaSucesso: document.getElementById('taxaSucesso').value, margemLucro: document.getElementById('margemInput').value, foto: pegaTexto('fotoUrlProjeto') };
    if (editandoCarrinhoId) { var idx = carrinho.findIndex(i => i.id === editandoCarrinhoId); if (idx > -1) carrinho[idx] = novoItem; editandoCarrinhoId = null; var btnAdd = document.getElementById('btn_add_carrinho'); var btnCancel = document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent = "➕ Adicionar Item"; btnAdd.style.background = "var(--orange)"; } if(btnCancel) btnCancel.style.display = "none"; showToast("🛒 Item atualizado no Pedido!"); } else { carrinho.push(novoItem); showToast("🛒 Item adicionado ao Pedido!"); }
    resetarInputProjeto(); 
    if (canalSel) canalSel.value = "Direta";
    var elPerso = document.getElementById('valorPersonalizado');
    if (elPerso) elPerso.value = '';
    localStorage.removeItem('3d4y_dark_valorPersonalizado');
    var cbLiq = document.getElementById('isLiquidoExato'); 
    if(cbLiq) cbLiq.checked = false;
    if(typeof mostrarValorPersonalizado === 'function') mostrarValorPersonalizado();
    renderCarrinho(); 
    calcular();
}

function cancelarEdicaoCarrinho() { editandoCarrinhoId = null; var btnAdd = document.getElementById('btn_add_carrinho'); var btnCancel = document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent = "➕ Adicionar Item"; btnAdd.style.background = "var(--orange)"; } if(btnCancel) btnCancel.style.display = "none"; resetarInputProjeto(); calcular(); showToast("❌ Edição cancelada"); }
function removerDoCarrinho(id) { carrinho = carrinho.filter(i => i.id !== id); renderCarrinho(); calcular(); }
function editarItemCarrinho(id) { 
    var item = carrinho.find(i => i.id === id); if(!item) return; 
    preencherFormProjeto(item); 
    
    if (item.precoVendaExato && parseLocal(item.precoVendaExato) > 0) {
        var elCanal = document.getElementById('canalVendaSelecionado');
        if (elCanal) elCanal.value = 'Personalizado';
        var elPerso = document.getElementById('valorPersonalizado');
        if (elPerso) {
            elPerso.value = formatarMoeda(parseLocal(item.precoVendaExato));
            salvarDinamico('valorPersonalizado');
        }
        if (typeof mostrarValorPersonalizado === 'function') mostrarValorPersonalizado();
    }
    
    editandoCarrinhoId = id; var btnAdd = document.getElementById('btn_add_carrinho'); var btnCancel = document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent = "💾 Atualizar Item"; btnAdd.style.background = "var(--purple)"; } if(btnCancel) btnCancel.style.display = "block"; showToast("✏️ Item carregado para edição!"); window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function renderCarrinho() {
    var container = document.getElementById('carrinho_container'); var lista = document.getElementById('lista_itens_carrinho'); if(!container || !lista) return; if(carrinho.length === 0) { container.style.display = 'none'; return; } container.style.display = 'block'; lista.innerHTML = ''; var totCusto = 0, totValorComLucro = 0;
    carrinho.forEach(item => { 
        totCusto += parseLocal(item.custo); 
        totValorComLucro += parseLocal(item.valorComLucro); 
        var htmlFoto = item.foto ? `<div style="width:30px; height:30px; border-radius:4px; background-image:url('${item.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>` : ''; 
        var txtVendaBase = item.precoVendaExato && parseLocal(item.precoVendaExato) > 0 ? `Venda Fixada: R$ ${formatarMoeda(parseLocal(item.precoVendaExato))}` : `Venda Base: R$ ${formatarMoeda(parseLocal(item.valorComLucro))}`;
        lista.innerHTML += `<div style="background: #0f172a; padding: 8px; border-radius: 8px; position: relative; border: 1px solid var(--border); display:flex; align-items:center;">${htmlFoto}<div style="flex:1;"><button onclick="editarItemCarrinho(${item.id})" style="position: absolute; right: 35px; top: 5px; background: none; border: none; color: var(--sky); font-size: 1rem; cursor: pointer;">✎</button><button onclick="removerDoCarrinho(${item.id})" style="position: absolute; right: 5px; top: 5px; background: none; border: none; color: #ef4444; font-size: 1rem; font-weight: bold; cursor: pointer;">×</button><div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); padding-right: 50px;">${item.nome}</div><div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 3px;">Custo Peça: R$ ${formatarMoeda(parseLocal(item.custo))} | ${txtVendaBase}</div></div></div>`; 
    });
    
    var totalQtd = carrinho.reduce((a,b) => a + parseLocal(b.qtd), 0); if(totalQtd < 1) totalQtd = 1; 
    var cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); 
    var frete = pegaValor('valorFreteManual'); 
    
    var totS = 0, totM = 0, totD = 0;
    var totBaseForRatio = totValorComLucro === 0 ? 1 : totValorComLucro;
    
    carrinho.forEach(i => {
        var iQtd = parseLocal(i.qtd || 1);
        var iPrecoExato = parseLocal(i.precoVendaExato || 0);
        var iValLucro = parseLocal(i.valorComLucro || 0);

        if (iPrecoExato > 0) {
            totS += iPrecoExato;
            totM += iPrecoExato;
            totD += iPrecoExato;
        } else {
            var itemRatio = iValLucro / totBaseForRatio;
            var itemBaseTotal = iValLucro + (cLog * itemRatio);
            var itemBaseUnit = itemBaseTotal / iQtd;
            
            var p1 = (itemBaseUnit + 4) / 0.80, p2 = (itemBaseUnit + 16) / 0.86, p3 = (itemBaseUnit + 20) / 0.86, p4 = (itemBaseUnit + 26) / 0.86, bestPShp;
            if (p1 <= 79.991) bestPShp = p1; else if (p2 <= 99.991) bestPShp = p2; else if (p3 <= 199.991) bestPShp = p3; else bestPShp = p4;
            totS += (Math.round(bestPShp * 100) / 100) * iQtd;
            
            var txMl = pegaValor('taxaMeli')/100;
            var pAvgML_noFix = itemBaseUnit / (1 - txMl);
            var bestPMeli = (pAvgML_noFix >= 79.99) ? pAvgML_noFix : (itemBaseUnit + pegaValor('fixaMeli')) / (1 - txMl);
            totM += (Math.round(bestPMeli * 100) / 100) * iQtd;
            totD += itemBaseTotal;
        }
    });
    totD += frete;
    
    document.getElementById('cart_tot_custo').textContent = formatarMoeda(totCusto); 
    document.getElementById('cart_tot_vd').textContent = formatarMoeda(totD); 
    document.getElementById('cart_tot_vs').textContent = formatarMoeda(totS); 
    document.getElementById('cart_tot_vm').textContent = formatarMoeda(totM);
}

// ==========================================
// 10. CATÁLOGO
// ==========================================

window.cancelarEdicaoCatalogo = function() {
    editCatalogoId = null;
    var btnMain = document.getElementById('btn_salvar_catalogo_main');
    if(btnMain) { btnMain.textContent = "💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background = "var(--orange)"; }
    var btnCancel = document.getElementById('btn_cancelar_catalogo_main');
    if (btnCancel) btnCancel.style.display = "none";
    resetarInputProjeto();
    document.getElementById('sel_catalogo').value = "";
    document.getElementById('boxPrecoFixo').style.display = 'none';
    document.getElementById('precoFixoCatMain').value = "";
    localStorage.removeItem('3d4y_dark_precoFixoCatMain');
    calcular();
    showToast("❌ Edição cancelada");
};

function salvarNoCatalogo() {
    var nome = pegaTexto('nomeProjeto'); if(!nome) { showToast("❌ Dê um nome ao projeto antes de salvar no catálogo.", true); return; }
    var precoFixo = pegaTexto('precoFixoCatMain'), fotoUrl = pegaTexto('fotoUrlProjeto'), extras = [], multiOn = document.getElementById('toggle_multi_mat').checked;
    
    if(multiOn) { 
        var qtd = parseInt(pegaValor('qtdCoresExtras')) || 1; 
        for(var i=2; i<=qtd+1; i++) { 
            extras.push({ tipo: pegaTexto('tipoFilamento'+i), cor: pegaTexto('corFilamento'+i), marca: pegaTexto('marcaFilamento'+i), preco: pegaTexto('precoFilamento'+i), peso: pegaTexto('pesoPeca'+i) }); 
        } 
    }
    
    var existe = catalogo.find(p => p.nome.toLowerCase().trim() === nome.toLowerCase().trim());
    
    if (editCatalogoId) {
        if (existe && existe.id !== editCatalogoId) { showToast("❌ Já existe outro projeto com este nome exato no seu catálogo.", true); return; }
        var idx = catalogo.findIndex(p => p.id === editCatalogoId);
        
        if (idx > -1) {
            var pAntigo = catalogo[idx];
            var nomeMinusculo = (pAntigo.nome || "").toLowerCase().trim();
            var vendasAfetadas = historico.filter(h => {
                if (h.vendaIsolada) return false;
                var nomeHistoricoClean = (h.nome || "").toLowerCase().trim().replace(/^\d+x\s/, '');
                return nomeHistoricoClean === nomeMinusculo;
            });
            if (vendasAfetadas.length > 0) {
                if (confirm(`Deseja atualizar o PESO, TEMPO e CUSTO das ${vendasAfetadas.length} venda(s) PADRÃO deste produto no histórico?\n\n(Pedidos que você editou manualmente estão protegidos por 🔒 e não serão afetados).`)) {
                    var nMaq = pegaValor('maquina'), nVid = pegaValor('vidaUtil'), nCon = pegaValor('consumoW'), nKwh = pegaValor('precoKwh'), custoHoraBase = (nMaq / (nVid || 1)) + ((nCon / 1000) * nKwh), novoTempoUnit = pegaValor('tempoH'), novoPesoUnit = pegaValor('pesoPeca'), precoFilamentoUnit = pegaValor('precoFilamento') || 120, taxaSucesso = (pegaValor('taxaSucesso') || 100) / 100;
                    vendasAfetadas.forEach(h => {
                        var qtdItem = parseLocal(h.totalQtd || 1);
                        h.tempo = novoTempoUnit * qtdItem;
                        h.peso = novoPesoUnit * qtdItem;
                        h.custo = ((h.tempo * custoHoraBase) + ((h.peso * precoFilamentoUnit) / 1000)) / taxaSucesso;
                        var taxas = descontarTaxas(parseLocal(h.valorBruto), qtdItem, h.cartItems);
                        if(h.canal === "Shopee") h.valorLiquido = taxas.shopee;
                        else if(h.canal === "Meli") h.valorLiquido = taxas.meli;
                        else h.valorLiquido = parseLocal(h.valorBruto);
                        if(h.valorLiquido < 0) h.valorLiquido = 0;
                    });
                }
            }
            catalogo[idx] = { id: editCatalogoId, nome: nome, precoFixo: precoFixo, peso1: pegaTexto('pesoPeca'), tipo1: pegaTexto('tipoFilamento1'), cor1: pegaTexto('corFilamento1'), marca1: pegaTexto('marcaFilamento1'), preco1: pegaTexto('precoFilamento'), tempo: pegaTexto('tempoH'), multi: multiOn, qtdCores: multiOn ? pegaTexto('qtdCoresExtras') : "0", extras: extras, foto: fotoUrl };
        }
        
        editCatalogoId = null;
        var btnMain = document.getElementById('btn_salvar_catalogo_main');
        if(btnMain) { btnMain.textContent = "💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background = "var(--orange)"; }
        var btnCancel = document.getElementById('btn_cancelar_catalogo_main');
        if(btnCancel) btnCancel.style.display = "none";
        showToast("🏷️ Produto atualizado no catálogo!");
        
    } else {
        if (existe) { showToast("❌ O projeto JÁ EXISTE no seu Catálogo de Produtos!", true); return; }
        var novoProduto = { id: Date.now(), nome: nome, precoFixo: precoFixo, peso1: pegaTexto('pesoPeca'), tipo1: pegaTexto('tipoFilamento1'), cor1: pegaTexto('corFilamento1'), marca1: pegaTexto('marcaFilamento1'), preco1: pegaTexto('precoFilamento'), tempo: pegaTexto('tempoH'), multi: multiOn, qtdCores: multiOn ? pegaTexto('qtdCoresExtras') : "0", extras: extras, foto: fotoUrl };
        catalogo.push(novoProduto);
        showToast("🏷️ Produto salvo no catálogo!");
    }
    
    document.getElementById('precoFixoCatMain').value = ""; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); document.getElementById('boxPrecoFixo').style.display = 'none'; resetarDados(); syncNuvem(); renderCatalogo(); renderHistorico();
}

function renderCatalogo() {
    var sel = document.getElementById('sel_catalogo'); var lista = document.getElementById('lista_catalogo'); if(!sel || !lista) return;
    var catalogoOrdenado = [...catalogo].sort((a, b) => (a.nome || "").localeCompare(b.nome || "")); var htmlSel = '<option value="">-- Escolher produto cadastrado --</option>'; var htmlLista = catalogoOrdenado.length === 0 ? '<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Nenhum produto cadastrado</p>' : '';
    catalogoOrdenado.forEach(function(p) {
        htmlSel += `<option value="${p.id}">${p.nome}</option>`; var pesoTotal = parseLocal(p.peso1); if(p.multi && p.extras && p.extras.length > 0) { p.extras.forEach(function(ex) { pesoTotal += parseLocal(ex.peso); }); }
        var pesoStr = formatarMoeda(pesoTotal) + 'g', htmlPrecoFixo = p.precoFixo && parseFloat(p.precoFixo.replace('.','').replace(',','.')) > 0 ? ' | Venda Fixo: R$ ' + p.precoFixo : '', htmlFoto = p.foto ? `<div style="width:40px; height:40px; border-radius:6px; background-image:url('${p.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>` : '';
        htmlLista += `<div class="history-item"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">${htmlFoto}<div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; word-wrap: break-word;">${p.nome}</h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Tempo: ${p.tempo}h | Peso Total: ${pesoStr}${htmlPrecoFixo}</div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarDoCatalogo(${p.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerDoCatalogo(${p.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`;
    });
    sel.innerHTML = htmlSel; lista.innerHTML = htmlLista;
}

function carregarDoCatalogo() { var id = document.getElementById('sel_catalogo').value; if(!id) { resetarInputProjeto(); document.getElementById('canalVendaSelecionado').value = "Direta"; document.getElementById('valorPersonalizado').value = ""; mostrarValorPersonalizado(); var boxPreco = document.getElementById('boxPrecoFixo'); if(boxPreco) boxPreco.style.display = 'none'; document.getElementById('precoFixoCatMain').value = ''; calcular(); return; } aplicarDadosNoForm(id, false); showToast("🏷️ Dados carregados!"); }

function editarDoCatalogo(id) {
    aplicarDadosNoForm(id, true); editCatalogoId = id;
    var btnMain = document.getElementById('btn_salvar_catalogo_main'); if (btnMain) { btnMain.textContent = "💾 Confirmar Edição no Catálogo"; btnMain.style.background = "var(--sky)"; }
    var btnCancel = document.getElementById('btn_cancelar_catalogo_main'); if (btnCancel) btnCancel.style.display = "inline-block";
    window.fecharModal('catalogoModal'); window.fecharGaveta();
    window.scrollTo({ top: 0, behavior: 'smooth' }); var dash = document.querySelector('.dashboard'); if (dash) dash.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("✏️ Produto carregado para edição!");
}

function aplicarDadosNoForm(id, isEditing = false) {
    var p = catalogo.find(e => e.id.toString() === id.toString()); if(!p) return;
    var fakeProd = { nome: p.nome, qtd: 1, tempo1: p.tempo, peso1: p.peso1, tipo1: p.tipo1, cor1: p.cor1, marca1: p.marca1, preco1: p.preco1, multi: p.multi, qtdCores: p.qtdCores, extras: p.extras, foto: p.foto };
    preencherFormProjeto(fakeProd);
    var elPrecoFixo = document.getElementById('precoFixoCatMain'); var boxPreco = document.getElementById('boxPrecoFixo');
    if(isEditing) { if(elPrecoFixo && boxPreco) { boxPreco.style.display = 'flex'; elPrecoFixo.value = p.precoFixo || ''; salvarDinamico('precoFixoCatMain'); } } 
    else { if(boxPreco) boxPreco.style.display = 'none'; if(elPrecoFixo) { elPrecoFixo.value = ''; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); } }
    if (p.precoFixo && parseFloat(p.precoFixo.replace('.','').replace(',','.')) > 0) { document.getElementById('canalVendaSelecionado').value = 'Personalizado'; document.getElementById('valorPersonalizado').value = p.precoFixo; salvarDinamico('valorPersonalizado'); mostrarValorPersonalizado(); } else { document.getElementById('canalVendaSelecionado').value = 'Direta'; document.getElementById('valorPersonalizado').value = ''; salvarDinamico('valorPersonalizado'); mostrarValorPersonalizado(); }
    calcular();
}
window.darBaixaEstoqueVenda = function(h) {
    if (h.materiais && h.materiais !== "Não informado") {
        let mats = h.materiais.split(' + ');
        mats.forEach(m => {
            let match = m.match(/(.+?)\s+\(([\d.,]+)g\)/);
            if (match) {
                let nomeMat = match[1].trim(); 
                let pesoGasto = parseLocal(match[2]);
                
                let itemEstoque = estoque.find(e => {
                    let n = (e.tipo + " " + e.cor + " " + (e.marca || "")).trim();
                    let nCurto = (e.tipo + " " + e.cor).trim();
                    return n === nomeMat || nCurto === nomeMat;
                });
                
                if (itemEstoque) {
                    itemEstoque.pesoAtual = (itemEstoque.pesoAtual || 1000) - pesoGasto;
                    if (itemEstoque.pesoAtual < 0) itemEstoque.pesoAtual = 0;
                }
            }
        });
        showToast("📉 Materiais descontados do estoque!");
        renderEstoque();
    }
};

function mudarStatus(id, novoStatus) { 
    var index = historico.findIndex(h => h.id === id); 
    if (index > -1) { 
        var h = historico[index];
        h.status = novoStatus; 
        
        if ((novoStatus === 'Finalizado' || novoStatus === 'Enviado / Entregue') && !h.estoqueBaixado) {
            if (confirm("Deseja dar baixa dos materiais gastos nesta peça (" + formatarMoeda(h.peso) + "g) no Estoque?")) {
                window.darBaixaEstoqueVenda(h);
                h.estoqueBaixado = true;
            }
        }
        
        syncNuvem(); renderHistorico(); 
    } 
}

window.registrarFalha = function(id) {
    var h = historico.find(x => x.id === id);
    if (!h) return;
    var pesoPerdidoStr = prompt(`🚨 Registrar Refugo / Perda para: ${h.nome}\n\nQuantas gramas de filamento foram perdidas?`, formatarMoeda(h.peso));
    
    if (pesoPerdidoStr) {
        var pesoPerdido = parseLocal(pesoPerdidoStr);
        if (pesoPerdido > 0) {
            var custoPorGrama = h.peso > 0 ? (h.custo / h.peso) : (120/1000);
            var custoPrejuizo = custoPorGrama * pesoPerdido;
            
            despesas.unshift({
                id: Date.now(),
                data: new Date().toLocaleDateString('pt-BR'),
                qtd: 1,
                nome: "⚠️ Refugo de Material: " + h.nome,
                valor: custoPrejuizo
            });
            
            var t1 = h.tipo1, c1 = h.cor1, m1 = h.marca1;
            if (t1) {
                 let itemEstoque = estoque.find(e => e.tipo === t1 && e.cor === c1 && e.marca === m1) || estoque.find(e => e.tipo === t1 && e.cor === c1);
                 if (itemEstoque) {
                      itemEstoque.pesoAtual = (itemEstoque.pesoAtual || 1000) - pesoPerdido;
                      if(itemEstoque.pesoAtual < 0) itemEstoque.pesoAtual = 0;
                 }
            }
            
            syncNuvem();
            renderDespesas();
            renderEstoque();
            showToast("🗑️ Refugo registrado nas despesas e estoque!");
        }
    }
};

function renderHistorico() {
    var lista = document.getElementById('listaHistorico'); if(!lista) return; var filtroDiv = document.getElementById('filtroHistorico');
    var somaCusto = 0, somaBruto = 0, somaLiquido = 0, somaLucro = 0, somaLogistica = 0, somaDireta = 0, somaShopee = 0, somaMeli = 0, qtdDireta = 0, qtdShopee = 0, qtdMeli = 0, qtdValida = 0, totDevolvido = 0;
    var counts = { 'Todos': historico.length, 'Orçamento': 0, 'Na Fila': 0, 'Imprimindo': 0, 'Finalizado': 0, 'Enviado / Entregue': 0, 'Devolução': 0 }; window.horasTotaisImpressasGlobal = 0;
    var campoBusca = document.getElementById('buscaCliente'), termoBusca = campoBusca ? campoBusca.value.toLowerCase().trim() : '';
    historico.forEach(function(item) {
        var st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue'; counts[st] = (counts[st] || 0) + 1;
        if (st !== 'Orçamento' && st !== 'Devolução') {
            var custoItem = parseLocal(item.custo), freteLogItem = parseLocal(item.frete || 0) + parseLocal(item.logistica || 0), canalStr = item.canal || "Direta", valLiq = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)), valBruto = item.valorBruto !== undefined ? parseLocal(item.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem;
            somaCusto += custoItem; somaLogistica += freteLogItem; somaBruto += valBruto; somaLiquido += valLiq; somaLucro += lucroItem; qtdValida++;
            if(canalStr === "Shopee") { somaShopee += valLiq; qtdShopee++; } else if(canalStr === "Meli") { somaMeli += valLiq; qtdMeli++; } else { somaDireta += valLiq; qtdDireta++; }
        }
        if (st === 'Devolução') { var valLiqDev = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)); totDevolvido += valLiqDev; }
        if (st === 'Imprimindo' || st === 'Finalizado' || st === 'Enviado / Entregue') { window.horasTotaisImpressasGlobal += parseLocal(item.tempo); }
    });

    var lblOdometro = document.getElementById('lbl_horas_totais_maquina'); if (lblOdometro) lblOdometro.textContent = formatarMoeda(window.horasTotaisImpressasGlobal) + "h";
    var txtVida = document.getElementById('txt_vida_util'), barVida = document.getElementById('bar_vida_util'), msgVida = document.getElementById('msg_vida_util'), qaAviso = pegaValor('qa_aviso'); if (qaAviso <= 0 || isNaN(qaAviso)) qaAviso = 100;
    var offset = parseFloat(window.qaOffset) || 0, hrsAtuais = window.horasTotaisImpressasGlobal - offset; if (hrsAtuais < 0 || isNaN(hrsAtuais)) hrsAtuais = 0;
    var pctQA = (hrsAtuais / qaAviso) * 100; if (isNaN(pctQA) || pctQA < 0) pctQA = 0; if(pctQA > 100) pctQA = 100;
    if (txtVida && barVida && msgVida) {
        txtVida.textContent = formatarMoeda(hrsAtuais) + "h / " + qaAviso + "h"; barVida.style.width = pctQA + "%";
        if (pctQA < 50) { msgVida.textContent = "🟢 Saudável. A máquina está 100% livre!"; barVida.style.background = "var(--success)"; } else if (pctQA < 85) { msgVida.textContent = "🟡 Requer Atenção: Agende uma manutenção/lubrificação em breve."; barVida.style.background = "#facc15"; } else { msgVida.textContent = "🔴 CUIDADO: Risco iminente de quebra ou perda de qualidade."; barVida.style.background = "var(--danger)"; }
    }

    if (filtroDiv) { filtroDiv.innerHTML = `<button class="filter-btn ${window.filtroStatusAtual === 'Todos' ? 'active' : ''}" onclick="mudarFiltro('Todos')">📋 Todos (${counts['Todos']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Orçamento' ? 'active' : ''}" onclick="mudarFiltro('Orçamento')">🟡 Orç. (${counts['Orçamento']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Na Fila' ? 'active' : ''}" onclick="mudarFiltro('Na Fila')">🔵 Fila (${counts['Na Fila']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Imprimindo' ? 'active' : ''}" onclick="mudarFiltro('Imprimindo')">🟣 Impr. (${counts['Imprimindo']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Finalizado' ? 'active' : ''}" onclick="mudarFiltro('Finalizado')">🟢 Fin. (${counts['Finalizado']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Enviado / Entregue' ? 'active' : ''}" onclick="mudarFiltro('Enviado / Entregue')">🚚 Env. (${counts['Enviado / Entregue']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Devolução' ? 'active' : ''}" onclick="mudarFiltro('Devolução')">❌ Devol. (${counts['Devolução']})</button>`; }

    var itensFiltrados = historico.filter(function(item) { var st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue'; var passaStatus = window.filtroStatusAtual === 'Todos' || st === window.filtroStatusAtual; var passaBusca = true; if (termoBusca !== '') { var nomeC = (item.cliente || '').toLowerCase(), nomeP = (item.nome || '').toLowerCase(); if (!nomeC.includes(termoBusca) && !nomeP.includes(termoBusca)) { passaBusca = false; } } return passaStatus && passaBusca; });
    var isFila = window.filtroStatusAtual === 'Na Fila'; if (isFila) { itensFiltrados.sort((a, b) => { return (a.posicaoFila || a.id) - (b.posicaoFila || b.id); }); }
    lista.innerHTML = itensFiltrados.length === 0 ? '<p style="text-align:center; color:var(--text-muted); font-size:0.7rem; margin-top:10px;">Nenhum pedido encontrado</p>' : '';
    
    itensFiltrados.forEach(function(item, index) {
        var custoItem = parseLocal(item.custo), freteLogItem = parseLocal(item.frete || 0) + parseLocal(item.logistica || 0), canalStr = item.canal || "Direta", valLiq = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)), valBruto = item.valorBruto !== undefined ? parseLocal(item.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem, tagCanal = canalStr === "Direta" ? "PIX" : canalStr === "Shopee" ? "SHP" : "ML", corTag = canalStr === "Shopee" ? "#f94d30" : canalStr === "Meli" ? "#facc15" : "#10b981", st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue';
        var colorClass = st === 'Orçamento' ? 'status-orcamento' : st === 'Na Fila' ? 'status-fila' : st === 'Imprimindo' ? 'status-imprimindo' : st === 'Enviado / Entregue' ? 'status-enviado' : st === 'Devolução' ? 'status-devolucao' : 'status-finalizado';
        var crmHtml = item.cliente ? '<div style="font-size: 0.65rem; color: var(--sky); margin-bottom: 6px; font-weight: 600;">👤 Cliente: ' + item.cliente + '</div>' : '';
        var txtVenda = (valBruto !== valLiq) ? `Líq: R$ ${formatarMoeda(valLiq)} <span style="font-size:0.55rem; color:var(--text-muted); font-weight:normal;">(Bruto: R$ ${formatarMoeda(valBruto)})</span>` : `R$ ${formatarMoeda(valLiq)}`;
        var prefixoFila = isFila ? `<span style="color: var(--sky); font-weight: 900; margin-right: 5px;">[${index + 1}º]</span> ` : '', bordaUrgente = item.urgente ? 'border: 2px solid var(--danger);' : 'border: 1px solid var(--border);'; if(st === 'Devolução') bordaUrgente = 'border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.05); opacity: 0.8;';
        var tagUrgente = item.urgente ? `<span style="font-size:0.55rem; color:#fff; background:var(--danger); padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:bold;">🔥 URGENTE</span>` : '';
        var checkEstoque = item.estoqueBaixado ? `<span style="font-size:0.55rem; color:#10b981; margin-left:5px;" title="Estoque Descontado">📉 OK</span>` : '';
        var lockIcon = item.vendaIsolada ? `<span style="font-size:0.65rem; margin-left:5px;" title="Venda Protegida: Alterações no catálogo não afetam este pedido">🔒</span>` : '';
        
        var fotoParaMostrar = item.foto;
        if (!fotoParaMostrar) { var nomeParaBusca = (item.nome || "").toLowerCase().trim(); var matchQtd = nomeParaBusca.match(/^\d+x\s(.*)/); if(matchQtd) nomeParaBusca = matchQtd[1]; var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === nomeParaBusca); if (matchCat && matchCat.foto) fotoParaMostrar = matchCat.foto; }
        var htmlFoto = fotoParaMostrar ? `<div style="width:45px; height:45px; border-radius:6px; background-image:url('${fotoParaMostrar}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>` : '';
        
        var btnFalha = `<button onclick="registrarFalha(${item.id})" style="background:none;border:none;font-size:1.1rem;cursor:pointer;padding:0;margin-left:5px;" title="Registrar Refugo / Perda">🗑️</button>`;
        var botoesHTML = `${isFila ? `<button onclick="moverFila(${item.id}, -1)" style="background:none;border:none;font-size:1.1rem;cursor:pointer;padding:0;" title="Subir na Fila">⬆️</button><button onclick="moverFila(${item.id}, 1)" style="background:none;border:none;font-size:1.1rem;cursor:pointer;padding:0;" title="Descer na Fila">⬇️</button>` : ''}${btnFalha}<button onclick="editarItemHistorico(${item.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;margin-left:5px;" title="Editar">✎</button><button onclick="removerItem(${item.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;margin-left:5px;" title="Excluir">×</button>`;
        lista.innerHTML += `<div class="history-item" style="${bordaUrgente}"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">${htmlFoto}<div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; word-wrap: break-word;">${prefixoFila}<span style="font-size:0.6rem; color:#000; background:${corTag}; padding:2px 5px; border-radius:4px; margin-right:6px; vertical-align: middle; display: inline-block;">${tagCanal}</span>${item.nome}${tagUrgente}${checkEstoque}${lockIcon}</h4><div style="margin-top: 6px;"><select class="status-select ${colorClass}" onchange="mudarStatus(${item.id}, this.value)"><option value="Orçamento" ${st==='Orçamento'?'selected':''}>🟡 Orçamento</option><option value="Na Fila" ${st==='Na Fila'?'selected':''}>🔵 Na Fila</option><option value="Imprimindo" ${st==='Imprimindo'?'selected':''}>🟣 Imprimindo</option><option value="Finalizado" ${st==='Finalizado'?'selected':''}>🟢 Finalizado</option><option value="Enviado / Entregue" ${st==='Enviado / Entregue'?'selected':''}>🚚 Enviado / Entregue</option><option value="Devolução" ${st==='Devolução'?'selected':''}>❌ Devolução</option></select></div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">${botoesHTML}</div></div>${crmHtml}<div class="hist-vals" style="margin-top: 5px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px;"><span style="grid-column: span 2;">Venda: <b style="color:#fff">${txtVenda}</b></span><span>Custo Fab: R$ ${formatarMoeda(custoItem)}</span><span>Frete/Log: R$ ${formatarMoeda(freteLogItem)}</span><span style="grid-column: span 2; color:#10b981; font-size:0.75rem;">Lucro: <b>R$ ${formatarMoeda(lucroItem)}</b></span><span style="grid-column: span 2; font-size: 0.6rem; opacity: 0.5;">Data: ${item.data}</span></div></div>`;
    });
    
    document.getElementById('tot_qtd').textContent = qtdValida; document.getElementById('tot_custo').textContent = formatarMoeda(somaCusto); document.getElementById('tot_logistica').textContent = formatarMoeda(somaLogistica); document.getElementById('tot_faturamento_bruto').textContent = formatarMoeda(somaBruto); document.getElementById('tot_faturamento').textContent = formatarMoeda(somaLiquido); document.getElementById('tot_lucro').textContent = formatarMoeda(somaLucro); 
    var divDev = document.getElementById('tot_devolucoes'); if(divDev) divDev.textContent = formatarMoeda(totDevolvido);
    document.getElementById('qtd_direta').textContent = qtdDireta; document.getElementById('tot_direta').textContent = formatarMoeda(somaDireta); document.getElementById('qtd_shopee').textContent = qtdShopee; document.getElementById('tot_shopee').textContent = formatarMoeda(somaShopee); document.getElementById('qtd_meli').textContent = qtdMeli; document.getElementById('tot_meli').textContent = formatarMoeda(somaMeli);
    atualizarLucroReal();
}

function removerItem(id) { if(confirm("Deseja apagar este projeto do histórico?")) { historico = historico.filter(h => h.id !== id); syncNuvem(); } }

function resetarDados() {
    carrinho = []; renderCarrinho(); document.getElementById('fotoUrlProjeto').value = ""; var p = document.getElementById('previewFotoMain'); if(p) p.style.display = "none";
    ['nomeCliente', 'telefoneCliente', 'valorPersonalizado', 'precoFixoCatMain'].forEach(id => { var el = document.getElementById(id); if(el) { el.value = ""; localStorage.removeItem('3d4y_dark_' + id); } });
    var cE = document.getElementById('custoEmbalagem'); if(cE) cE.value = window.configGlobais.custoEmbalagem || "0,00"; var cD = document.getElementById('custoDeslocamento'); if(cD) cD.value = window.configGlobais.custoDeslocamento || "0,00"; var vF = document.getElementById('valorFreteManual'); if(vF) vF.value = "0,00";
    var selCat = document.getElementById('sel_catalogo'); if(selCat) selCat.value = ""; var boxPreco = document.getElementById('boxPrecoFixo'); if(boxPreco) boxPreco.style.display = 'none';
    
    var cbLiq = document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked = false; 

    editCatalogoId = null; var btnMainCat = document.getElementById('btn_salvar_catalogo_main'); if(btnMainCat) { btnMainCat.textContent = "💾 Salvar Novo Projeto no Catálogo"; btnMainCat.style.background = "var(--orange)"; } var btnCancelCatMain = document.getElementById('btn_cancelar_catalogo_main'); if(btnCancelCatMain) btnCancelCatMain.style.display = "none";
    editHistoricoId = null; var btnSaveMain = document.getElementById('btn_salvar_venda_main'); if(btnSaveMain) { btnSaveMain.textContent = "💾 Salvar Venda"; btnSaveMain.style.background = "var(--purple)"; } var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "none";
    editandoCarrinhoId = null; var btnAdd = document.getElementById('btn_add_carrinho'); var btnCancel = document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent = "➕ Adicionar Item"; btnAdd.style.background = "var(--orange)"; } if(btnCancel) btnCancel.style.display = "none";
    var tUrgente = document.getElementById('toggle_urgente'); if (tUrgente && tUrgente.checked) { tUrgente.checked = false; tUrgente.dispatchEvent(new Event('change')); }
    var cDestino = document.getElementById('canalPersonalizadoDestino'); if(cDestino) cDestino.value = 'Shopee';
    resetarInputProjeto(); calcular(); setTimeout(() => { showToast("✅ Projeto Limpo!"); }, 100); var dash = document.querySelector('.dashboard'); if(dash) dash.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === NOVA FUNÇÃO DE ENCURTAR LINK ===
window.encurtarUrl = async function(url) {
    if (!url || url.length < 35) return url;
    try {
        let res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://is.gd/create.php?format=json&url=' + encodeURIComponent(url))}`);
        let data = await res.json();
        let innerData = JSON.parse(data.contents);
        return innerData.shorturl || url;
    } catch(e) { return url; }
};

window.wpp = async function(tipo) {
    var w = window.open('', '_blank');
    if(w) w.document.write('<h3 style="font-family:sans-serif; text-align:center; margin-top:20vh; color:#3b82f6;">A gerar link curto do WhatsApp... Aguarde ⏳</h3>');

    var txt = "*Orçamento 3D 4You*\n\n", valF = 0, isCart = carrinho && carrinho.length > 0, isPersonalizado = document.getElementById('canalVendaSelecionado').value === 'Personalizado', canalPerso = document.getElementById('canalPersonalizadoDestino').value;
    if(isCart) { 
        txt += "*Itens do Pedido:*\n"; 
        for (let i of carrinho) {
            txt += "- " + i.nome + "\n"; 
            if(i.foto) {
                let linkCurto = await encurtarUrl(i.foto);
                txt += "  📷 Ver Peça: " + linkCurto + "\n";
            }
        }
        valF = tipo === 'direta' ? document.getElementById('cart_tot_vd').textContent : (tipo === 'shopee' ? document.getElementById('cart_tot_vs').textContent : document.getElementById('cart_tot_vm').textContent); 
    } 
    else { 
        var nProj = document.getElementById('nomeProjeto'), nome = nProj && nProj.value ? nProj.value : "Peça 3D", elQtd = document.getElementById('qtdPecasProjeto'), qtd = elQtd && elQtd.value !== "1" ? elQtd.value + "x " : ""; 
        txt += "*Projeto:* " + qtd + nome + "\n"; 
        var fotoUrl = pegaTexto('fotoUrlProjeto');
        if (fotoUrl) { 
            let linkCurto = await encurtarUrl(fotoUrl);
            txt += "📷 *Ver Peça:* " + linkCurto + "\n"; 
        }
        valF = tipo === 'direta' ? document.getElementById('r_vendaD').textContent : (tipo === 'shopee' ? document.getElementById('r_vendaS').textContent : document.getElementById('r_vendaM').textContent); 
    }
    if (isPersonalizado) { var vPerso = pegaTexto('valorPersonalizado'); if (vPerso) { if ((tipo === 'direta' && canalPerso === 'Direta') || (tipo === 'shopee' && canalPerso === 'Shopee') || (tipo === 'meli' && canalPerso === 'Meli')) { valF = vPerso; } } }
    txt += "\n*Valor Total:* R$ " + valF; 
    var tCli = document.getElementById('telefoneCliente'), tel = tCli && tCli.value ? tCli.value.replace(/\D/g, '') : ""; 
    var finalUrl = "https://wa.me/" + (tel ? "55"+tel : "") + "?text=" + encodeURIComponent(txt);
    if(w) { w.location.href = finalUrl; } else { window.open(finalUrl, '_blank'); }
};

window.gerarOrcamentoPDF = async function() {
    showToast("⏳ A gerar PDF com links... Aguarde!", false);
    const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(20); doc.text("ORÇAMENTO - 3D 4You", 14, 20); doc.setFontSize(12); doc.text("Data: " + new Date().toLocaleDateString('pt-BR'), 14, 30);
    var cliNome = pegaTexto('nomeCliente') || "Cliente Balcão"; doc.text("Cliente: " + cliNome, 14, 38);
    var isCart = carrinho && carrinho.length > 0, valF = 0, isPersonalizado = document.getElementById('canalVendaSelecionado').value === 'Personalizado', tipoCanal = document.getElementById('canalVendaSelecionado').value;
    if(isCart) { valF = tipoCanal === 'Direta' ? document.getElementById('cart_tot_vd').textContent : (tipoCanal === 'Shopee' ? document.getElementById('cart_tot_vs').textContent : document.getElementById('cart_tot_vm').textContent); } else { valF = tipoCanal === 'Direta' ? document.getElementById('r_vendaD').textContent : (tipoCanal === 'Shopee' ? document.getElementById('r_vendaS').textContent : document.getElementById('r_vendaM').textContent); }
    if (isPersonalizado) { var vPerso = pegaTexto('valorPersonalizado'); if (vPerso) valF = vPerso; }
    let startY = 50, tableData = [];
    if(isCart) { 
        for(let i of carrinho) {
            var descItem = i.nome;
            if(i.foto) {
                let linkCurto = await encurtarUrl(i.foto);
                descItem += "\n📷 Link da Foto: " + linkCurto;
            }
            tableData.push([descItem, "R$ " + formatarMoeda(parseLocal(i.valorComLucro))]); 
        }
    } else { 
        var nProj = document.getElementById('nomeProjeto').value || "Peça 3D", qtd = document.getElementById('qtdPecasProjeto').value || "1"; 
        var descItemUnico = qtd + "x " + nProj;
        var fotoUrl = pegaTexto('fotoUrlProjeto');
        if(fotoUrl) {
            let linkCurto = await encurtarUrl(fotoUrl);
            descItemUnico += "\n📷 Link da Foto: " + linkCurto;
        }
        tableData.push([descItemUnico, "R$ " + valF]); 
    }
    doc.autoTable({ startY: startY, head: [['Descrição do Item', 'Valor Estimado']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { overflow: 'linebreak' } });
    let finalY = doc.lastAutoTable.finalY + 15; doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text("VALOR TOTAL: R$ " + valF, 14, finalY); doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text("Orçamento sujeito a alteração. Válido por 7 dias.", 14, finalY + 10);
    doc.save("Orcamento_Cliente_3D4You.pdf"); showToast("✅ Orçamento PDF Gerado!");
};

window.gerarRelatorioGeral = function() {
    if (historico.length === 0) { showToast("⚠️ Nenhum dado para exportar", true); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.setFontSize(16); doc.text("Relatório Financeiro Geral - 3D 4You", 14, 15); doc.setFontSize(9); doc.text("Emitido em: " + new Date().toLocaleDateString('pt-BR'), 14, 21);
    let totVendas = 0, totBruto = 0, totLiquido = 0, totCusto = 0, totLucro = 0, totHoras = 0, somaLogistica = 0, totPeso = 0, qtdDireta = 0, somaDireta = 0, qtdShopee = 0, somaShopee = 0, qtdMeli = 0, somaMeli = 0, despesasTotais = despesas.reduce((acc, d) => acc + parseLocal(d.valor), 0), totDevolvido = 0;
    const tableDataDevolucoes = [], tableData = []; let usoFilamentos = {};
    historico.forEach(h => {
        let st = h.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue';
        let custoItem = parseLocal(h.custo), freteLogItem = parseLocal(h.frete || 0) + parseLocal(h.logistica || 0), canalStr = h.canal || "Direta", valLiq = h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : (h.valorVenda !== undefined ? parseLocal(h.valorVenda) : parseLocal(h.pix)), valBruto = h.valorBruto !== undefined ? parseLocal(h.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem, horas = parseLocal(h.tempo || 0), peso = parseLocal(h.peso || 0);
        if (st === 'Devolução') { totDevolvido += valLiq; tableDataDevolucoes.push([ h.data, h.cliente || 'Balcão', h.nome, st, canalStr, "R$ " + formatarMoeda(valLiq), "R$ " + formatarMoeda(lucroItem), formatarMoeda(horas) + "h" ]); } 
        else {
            tableData.push([ h.data, h.cliente || 'Balcão', h.nome, st, canalStr, "R$ " + formatarMoeda(valLiq), "R$ " + formatarMoeda(lucroItem), formatarMoeda(horas) + "h" ]);
            if (st !== 'Orçamento') { totVendas += parseLocal(h.totalQtd || 1); totBruto += valBruto; totLiquido += valLiq; totCusto += custoItem; somaLogistica += freteLogItem; totLucro += lucroItem; if(canalStr === "Shopee") { somaShopee += valLiq; qtdShopee++; } else if(canalStr === "Meli") { somaMeli += valLiq; qtdMeli++; } else { somaDireta += valLiq; qtdDireta++; } }
            if (st === 'Imprimindo' || st === 'Finalizado' || st === 'Enviado / Entregue') { totHoras += horas; totPeso += peso; if (h.materiais && h.materiais !== "Não informado") { let mats = h.materiais.split(' + '); mats.forEach(m => { let match = m.match(/(.+?)\s+\(([\d.,]+)g\)/); if (match) { let nomeMat = match[1].trim(), pesoMat = parseLocal(match[2]); if (!usoFilamentos[nomeMat]) usoFilamentos[nomeMat] = 0; usoFilamentos[nomeMat] += pesoMat; } }); } }
        }
    });
    let lucroReal = totLucro - despesasTotais; doc.setFillColor(240, 240, 240); doc.rect(14, 25, 268, 52, 'F');
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text("RESUMO FINANCEIRO (Excluindo Orçamentos e Devoluções):", 18, 32);
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text(`Faturamento Bruto: R$ ${formatarMoeda(totBruto)}`, 18, 40); doc.text(`Custo de Produção: R$ ${formatarMoeda(totCusto)}`, 85, 40); doc.text(`Despesas Gerais: R$ ${formatarMoeda(despesasTotais)}`, 160, 40);
    doc.text(`Faturamento Líquido: R$ ${formatarMoeda(totLiquido)}`, 18, 46); doc.text(`Custo Log/Frete: R$ ${formatarMoeda(somaLogistica)}`, 85, 46); doc.text(`Material Gasto: ${formatarMoeda(totPeso)}g (${formatarMoeda(totPeso/1000)}kg)`, 160, 46);
    doc.setFont(undefined, 'bold'); doc.text(`Lucro da Operação: R$ ${formatarMoeda(totLucro)}`, 18, 54); doc.text(`Tempo de Máquina: ${formatarMoeda(totHoras)}h`, 85, 54); doc.setTextColor(0, 150, 0); doc.text(`CAIXA REAL: R$ ${formatarMoeda(lucroReal)}`, 160, 54); doc.setTextColor(0, 0, 0);
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.text(`Total PIX/Direta: R$ ${formatarMoeda(somaDireta)}`, 18, 64); doc.text(`Total Shopee: R$ ${formatarMoeda(somaShopee)}`, 85, 64); doc.text(`Total M. Livre: R$ ${formatarMoeda(somaMeli)}`, 160, 64);
    doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text(`Devoluções (Retornou p/ Estoque): R$ ${formatarMoeda(totDevolvido)}`, 215, 64); doc.setTextColor(0, 0, 0);
    let currentY = 82, tableDataFilamentos = [], totaisMateriaisArray = Object.keys(usoFilamentos).map(k => ({ nome: k, peso: usoFilamentos[k] })); totaisMateriaisArray.sort((a, b) => b.peso - a.peso);
    totaisMateriaisArray.forEach(item => { tableDataFilamentos.push([ item.nome, formatarMoeda(item.peso) + "g", formatarMoeda(item.peso / 1000) + "kg" ]); });
    if (tableDataFilamentos.length > 0) { doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(249, 115, 22); doc.text("Consumo de Materiais (Itens Impressos)", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Material (Tipo / Cor / Marca)', 'Quantidade (Gramas)', 'Quantidade (Kilos)']], body: tableDataFilamentos, theme: 'grid', headStyles: { fillColor: [249, 115, 22] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15; }
    if (currentY > 150) { doc.addPage(); currentY = 20; }
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(59, 130, 246); doc.text("Histórico de Vendas", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Cliente', 'Projeto', 'Status', 'Canal', 'Valor (Líq)', 'Lucro', 'Tempo']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15;
    if (tableDataDevolucoes.length > 0) { if (currentY > 170) { doc.addPage(); currentY = 20; } doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text("Histórico de Devoluções", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Cliente', 'Projeto', 'Status', 'Canal', 'Valor Estornado', 'Lucro Nulo', 'Tempo']], body: tableDataDevolucoes, theme: 'grid', headStyles: { fillColor: [239, 68, 68] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15; }
    if (despesas.length > 0) { const tableDataDespesas = despesas.map(d => [ d.data, d.qtd + "x", d.nome, "R$ " + formatarMoeda(d.valor) ]); if (currentY > 170) { doc.addPage(); currentY = 20; } doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text("Histórico de Despesas / Compras", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Qtd', 'Descrição', 'Valor Total']], body: tableDataDespesas, theme: 'grid', headStyles: { fillColor: [239, 68, 68] }, styles: { fontSize: 8 } }); }
    doc.save("Relatorio_Geral_3D4You.pdf"); showToast("📄 Relatório PDF Gerado!");
};

window.exportarExcel = function() {
    if (historico.length === 0 && estoque.length === 0 && catalogo.length === 0 && despesas.length === 0) { showToast("⚠️ Nenhum dado para exportar", true); return; }
    var wb = XLSX.utils.book_new(), vendasValidas = historico.filter(h => h.status !== 'Devolução'), devolucoes = historico.filter(h => h.status === 'Devolução');
    if (vendasValidas.length > 0) { var dadosVendas = vendasValidas.map(h => ({ "Data": h.data, "Cliente": h.cliente || 'Balcão', "Projeto": h.nome, "Status": h.status, "Canal": h.canal, "Bruto (R$)": h.valorBruto !== undefined ? parseLocal(h.valorBruto) : (h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda)), "Líquido (R$)": h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda), "Custo Fab (R$)": parseLocal(h.custo), "Log/Frete (R$)": parseLocal(h.frete || 0) + parseLocal(h.logistica || 0), "Lucro (R$)": (h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda)) - parseLocal(h.custo) - parseLocal(h.frete || 0) - parseLocal(h.logistica || 0), "Tempo (h)": parseLocal(h.tempo), "Peso (g)": parseLocal(h.peso) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosVendas), "Vendas"); }
    if (devolucoes.length > 0) { var dadosDevolucoes = devolucoes.map(h => ({ "Data": h.data, "Cliente": h.cliente || 'Balcão', "Projeto": h.nome, "Status": h.status, "Canal": h.canal, "Valor Estornado (R$)": h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda), "Tempo Gasto (h)": parseLocal(h.tempo), "Peso Gasto (g)": parseLocal(h.peso) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosDevolucoes), "Devoluções"); }
    if (despesas.length > 0) { var dadosDespesas = despesas.map(d => ({ "Data": d.data, "Qtd": d.qtd, "Descrição": d.nome, "Valor (R$)": parseLocal(d.valor) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosDespesas), "Despesas"); }
    if (estoque.length > 0) { var dadosEstoque = estoque.map(e => ({ "Tipo": e.tipo, "Cor": e.cor, "Marca": e.marca, "Preço Pago (R$)": parseLocal(e.preco) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosEstoque), "Estoque"); }
    if (catalogo.length > 0) { var dadosCatalogo = catalogo.map(c => ({ "Produto": c.nome, "Tempo (h)": parseLocal(c.tempo), "Peso Principal (g)": parseLocal(c.peso1), "Preço Fixo (R$)": c.precoFixo ? parseLocal(c.precoFixo) : "N/A" })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosCatalogo), "Catálogo"); }
    XLSX.writeFile(wb, "Relatorio_3D4You.xlsx"); showToast("📊 Excel Exportado com Sucesso!");
};

window.fazerBackupJSON = function() {
    var dadosCompletos = { historico: historico, estoque: estoque, catalogo: catalogo, despesas: despesas, configGlobais: window.configGlobais, qaOffset: window.qaOffset };
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dadosCompletos)), downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", "Backup_3D4You_Seguro.json"); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove(); showToast("📦 Backup descarregado com sucesso!");
};

window.importarBackupJSON = function(input) {
    var file = input.files[0]; if (!file) return; var reader = new FileReader();
    reader.onload = function(e) { try { var dados = JSON.parse(e.target.result); historico = dados.historico || []; estoque = dados.estoque || []; catalogo = dados.catalogo || []; despesas = dados.despesas || []; window.configGlobais = dados.configGlobais || window.configGlobais; window.qaOffset = dados.qaOffset || 0; syncNuvem(); showToast("📥 Base de dados restaurada!"); setTimeout(() => location.reload(), 1500); } catch (error) { showToast("❌ Erro ao ler o ficheiro .json", true); console.error(error); } };
    reader.readAsText(file); input.value = ""; 
};

window.forcarRecalculoGeral = function() {
    if(!confirm("⚠️ ATENÇÃO: Isto vai varrer todo o seu histórico e recalcular os lucros, fretes e embalagens com a regra nova (1x por pedido). Deseja continuar?")) return;
    
    var emb = pegaValor('custoEmbalagem'), des = pegaValor('custoDeslocamento'), cLogGlobal = emb + des, corrigidos = 0, baixadosEstoque = 0;
    
    historico.forEach(h => {
        if (h.status === 'Orçamento' || h.status === 'Devolução' || h.vendaIsolada) return;
        
        h.logistica = cLogGlobal;
        var isCart = h.cartItems && h.cartItems.length > 0;
        var vBruto = parseLocal(h.valorBruto !== undefined ? h.valorBruto : (h.valorLiquido !== undefined ? h.valorLiquido : h.valorVenda));
        var vFrete = parseLocal(h.frete || 0), qtd = parseLocal(h.totalQtd || 1);

        if (isCart && h.canal !== "Personalizado" && h.canal !== "Direta") {
            var totValorComLucro = h.cartItems.reduce((a,b) => a + parseLocal(b.valorComLucro || 0), 0);
            var totBaseForRatio = totValorComLucro === 0 ? 1 : totValorComLucro;
            var novoTotS = 0, novoTotM = 0;
            
            h.cartItems.forEach(i => {
                var iQtd = parseLocal(i.qtd || 1);
                var iPrecoExato = parseLocal(i.precoVendaExato || 0);
                if (iPrecoExato > 0) {
                    novoTotS += iPrecoExato;
                    novoTotM += iPrecoExato;
                } else {
                    var itemRatio = parseLocal(i.valorComLucro || 0) / totBaseForRatio;
                    var itemBaseTotal = parseLocal(i.valorComLucro || 0) + (cLogGlobal * itemRatio);
                    var itemBaseUnit = itemBaseTotal / iQtd;
                    
                    var p1 = (itemBaseUnit + 4) / 0.80, p2 = (itemBaseUnit + 16) / 0.86, p3 = (itemBaseUnit + 20) / 0.86, p4 = (itemBaseUnit + 26) / 0.86, bestPShp;
                    if (p1 <= 79.991) bestPShp = p1; else if (p2 <= 99.991) bestPShp = p2; else if (p3 <= 199.991) bestPShp = p3; else bestPShp = p4;
                    novoTotS += (Math.round(bestPShp * 100) / 100) * iQtd;
                    
                    var txMl = pegaValor('taxaMeli') / 100;
                    var pAvgML_noFix = itemBaseUnit / (1 - txMl);
                    var bestPMeli = (pAvgML_noFix >= 79.99) ? pAvgML_noFix : (itemBaseUnit + pegaValor('fixaMeli')) / (1 - txMl);
                    novoTotM += (Math.round(bestPMeli * 100) / 100) * iQtd;
                }
            });

            if (h.canal === "Shopee") vBruto = novoTotS;
            if (h.canal === "Meli") vBruto = novoTotM;
            h.valorBruto = vBruto; 
        }

        if (h.canal === "Shopee") { h.valorLiquido = descontarTaxas(vBruto, qtd, h.cartItems).shopee - vFrete - h.logistica; }
        else if (h.canal === "Meli") { h.valorLiquido = descontarTaxas(vBruto, qtd, h.cartItems).meli - vFrete - h.logistica; }
        else { h.valorLiquido = vBruto; }
        
        if (h.valorLiquido < 0) h.valorLiquido = 0;
        corrigidos++;

        var st = h.status || "Finalizado"; 
        if (st === 'Enviado') st = 'Enviado / Entregue'; 
        if ((st === 'Finalizado' || st === 'Enviado / Entregue') && !h.estoqueBaixado) {
            window.darBaixaEstoqueVenda(h); 
            h.estoqueBaixado = true;        
            baixadosEstoque++;
        }
    });
    
    syncNuvem(); 
    renderHistorico(); 
    renderEstoque(); 
    
    showToast("✅ " + corrigidos + " vendas recalculadas com sucesso!"); 
    fecharModal('configModal');
};
