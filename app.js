// ==========================================
// 1. INICIALIZAÇÃO, SERVICE WORKER E UI
// ==========================================

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', () => { 
        navigator.serviceWorker.register('./sw.js').then(reg => console.log('PWA Registrado')).catch(err => console.log('Erro PWA', err)); 
    }); 
}

window.onclick = function(event) { 
    if (event.target.classList.contains('modal')) { window.fecharModal(event.target.id); } 
};

document.addEventListener('keydown', function(event) { 
    if (event.key === "Escape") { 
        document.querySelectorAll('.modal').forEach(function(modal) { 
            if (modal.style.display === 'block') { window.fecharModal(modal.id); } 
        }); 
        fecharGaveta(); 
    } 
});

window.abrirGaveta = function() { 
    document.getElementById('sideMenu').classList.add('open'); 
    document.getElementById('menuOverlay').classList.add('open'); 
};

window.fecharGaveta = function() { 
    document.getElementById('sideMenu').classList.remove('open'); 
    document.getElementById('menuOverlay').classList.remove('open'); 
};

function showToast(msg, isError = false) { 
    var t = document.getElementById("toast"); 
    if(t) { 
        t.textContent = msg; 
        t.style.background = isError ? "var(--danger)" : "var(--primary)"; 
        t.className = "show"; 
        setTimeout(() => t.className = "", 2500); 
    } 
}

// ==========================================
// 2. FIREBASE E VARIÁVEIS GLOBAIS
// ==========================================

const firebaseConfig = { 
    apiKey: "AIzaSyBHP744_ct0YNtEWT_s33Wpfv7udS9gSOg", 
    authDomain: "calculadora-3d-ed2c7.firebaseapp.com", 
    projectId: "calculadora-3d-ed2c7", 
    storageBucket: "calculadora-3d-ed2c7.firebasestorage.app", 
    messagingSenderId: "577875133404", 
    appId: "1:577875133404:web:d12015947e7c9fc19a8519" 
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();
db.enablePersistence().catch(function(err) { console.log("Offline indisponível:", err.code); });
const auth = firebase.auth(); 
let nuvemRef = null; 
let unsubscribeSnapshot = null;

var historico = [], estoque = [], catalogo = [], despesas = [], carrinho = [];
var editEstoqueId = null, editCatalogoId = null, editHistoricoId = null, editDespesaId = null, editandoCarrinhoId = null, filtroStatusAtual = 'Todos', clientesCadastrados = {};
window.qaOffset = 0; window.horasTotaisImpressasGlobal = 0; window.oldBaseVals = {};
window.configGlobais = { maquina: "3.275", vidaUtil: "3.000", consumoW: "350", precoKwh: "1,20", qa_aviso: "100", custoEmbalagem: "0,00", custoDeslocamento: "0,00", taxaMeli: "17", fixaMeli: "6,75", taxaSucesso: "80", margemLucro: "80" };

window.filtroDiasAtual = '30';
window.mudarFiltroDias = function(dias) { 
    window.filtroDiasAtual = dias; 
    renderHistorico(); 
    renderDespesas(); 
};

// ==========================================
// 3. SINCRONIZAÇÃO OTIMIZADA (SUBCOLEÇÕES)
// ==========================================

function salvarNoFirebase(colecao, item) { 
    if(nuvemRef && item && item.id) { 
        nuvemRef.collection(colecao).doc(item.id.toString()).set(item); 
    } 
}

function apagarNoFirebase(colecao, id) { 
    if(nuvemRef && id) { 
        nuvemRef.collection(colecao).doc(id.toString()).delete(); 
    } 
}

function escutarSubcolecao(colecao, arrayLocal, renderFunc, sortFunc) {
    nuvemRef.collection(colecao).onSnapshot(function(snapshot) {
        var mudou = false;
        snapshot.docChanges().forEach(function(change) {
            mudou = true; var val = change.doc.data();
            if (change.type === "added") { if(!arrayLocal.find(x => x.id === val.id)) arrayLocal.push(val); }
            if (change.type === "modified") { var idx = arrayLocal.findIndex(x => x.id === val.id); if(idx > -1) arrayLocal[idx] = val; }
            if (change.type === "removed") { var idx = arrayLocal.findIndex(x => x.id === val.id); if(idx > -1) arrayLocal.splice(idx, 1); }
        });
        if(mudou) { if(sortFunc) sortFunc(arrayLocal); if(renderFunc) renderFunc(); }
    });
}

function iniciarApp() {
    unsubscribeSnapshot = nuvemRef.onSnapshot(function(doc) {
        if (doc.exists) {
            var data = doc.data();
            window.qaOffset = data.qaOffset || 0; 
            window.configGlobais = data.configGlobais || window.configGlobais;
            
            document.getElementById('maquina').value = window.configGlobais.maquina || "3.275"; 
            document.getElementById('vidaUtil').value = window.configGlobais.vidaUtil || "3.000"; 
            document.getElementById('consumoW').value = window.configGlobais.consumoW || "350"; 
            document.getElementById('precoKwh').value = window.configGlobais.precoKwh || "1,20"; 
            document.getElementById('qa_aviso').value = window.configGlobais.qa_aviso || "100"; 
            document.getElementById('custoEmbalagem').value = window.configGlobais.custoEmbalagem || "0,00"; 
            document.getElementById('custoDeslocamento').value = window.configGlobais.custoDeslocamento || "0,00"; 
            document.getElementById('taxaMeli').value = window.configGlobais.taxaMeli || "17"; 
            document.getElementById('fixaMeli').value = window.configGlobais.fixaMeli || "6,75"; 
            document.getElementById('taxaSucesso').value = window.configGlobais.taxaSucesso || "80"; 
            document.getElementById('margemInput').value = window.configGlobais.margemLucro || "80";
            
            let elMargemSlider = document.getElementById('margemSlider'); 
            if(elMargemSlider) { elMargemSlider.value = pegaValor('margemInput'); updateSliderProgress(elMargemSlider); }
            
            // SCRIPT DE MIGRAÇÃO AUTOMÁTICA
            if (data.historico && data.historico.length > 0 && !data.migrado) {
                showToast("🔄 A criar novas pastas no Firebase... Aguarde!", false);
                async function migrarTudo() {
                    try {
                        for (let h of data.historico) { await nuvemRef.collection('historico').doc(h.id.toString()).set(h); }
                        for (let e of data.estoque) { await nuvemRef.collection('estoque').doc(e.id.toString()).set(e); }
                        for (let c of data.catalogo) { await nuvemRef.collection('catalogo').doc(c.id.toString()).set(c); }
                        for (let d of data.despesas) { await nuvemRef.collection('despesas').doc(d.id.toString()).set(d); }
                        await nuvemRef.update({ migrado: true, historico: firebase.firestore.FieldValue.delete(), estoque: firebase.firestore.FieldValue.delete(), catalogo: firebase.firestore.FieldValue.delete(), despesas: firebase.firestore.FieldValue.delete() });
                        showToast("✅ Base de dados migrada com sucesso!"); 
                        setTimeout(() => location.reload(), 2000);
                    } catch(err) { console.error(err); showToast("❌ Erro na migração!", true); }
                }
                migrarTudo();
            }
        } else { 
            nuvemRef.set({ qaOffset: 0, configGlobais: window.configGlobais, migrado: true }); 
        }
    });

    escutarSubcolecao('historico', historico, () => { atualizarListaClientes(); renderHistorico(); calcular(); }, arr => arr.sort((a,b) => b.id - a.id));
    escutarSubcolecao('estoque', estoque, () => { atualizarDropdownsEstoque(); renderEstoque(); }, null);
    escutarSubcolecao('catalogo', catalogo, () => { renderCatalogo(); }, null);
    escutarSubcolecao('despesas', despesas, () => { renderDespesas(); }, arr => arr.sort((a,b) => b.id - a.id));
}

function syncNuvem() { 
    window.configGlobais = { 
        maquina: pegaTexto('maquina') || "3.275", 
        vidaUtil: pegaTexto('vidaUtil') || "3.000", 
        consumoW: pegaTexto('consumoW') || "350", 
        precoKwh: pegaTexto('precoKwh') || "1,20", 
        qa_aviso: pegaTexto('qa_aviso') || "100", 
        custoEmbalagem: pegaTexto('custoEmbalagem') || "0,00", 
        custoDeslocamento: pegaTexto('custoDeslocamento') || "0,00", 
        taxaMeli: pegaTexto('taxaMeli') || "17", 
        fixaMeli: pegaTexto('fixaMeli') || "6,75", 
        taxaSucesso: pegaTexto('taxaSucesso') || "80", 
        margemLucro: pegaTexto('margemInput') || "80" 
    }; 
    if(nuvemRef) { nuvemRef.update({ qaOffset: window.qaOffset || 0, configGlobais: window.configGlobais }).catch(e => console.log(e)); } 
}

auth.onAuthStateChanged(user => {
    document.getElementById('loading-screen').style.display = 'none';
    if (user) { 
        document.getElementById('login-screen').style.display = 'none'; 
        document.getElementById('btnSair').style.display = 'inline-block'; 
        nuvemRef = db.collection("workspaces_3d4you").doc(user.uid); 
        iniciarApp(); 
    } else { 
        document.getElementById('login-screen').style.display = 'flex'; 
        document.getElementById('btnSair').style.display = 'none'; 
        if (unsubscribeSnapshot) unsubscribeSnapshot(); 
    }
});

window.fazerLogin = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return; document.getElementById('loading-screen').style.display = 'flex'; auth.signInWithEmailAndPassword(email, senha).catch(error => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('loginError').textContent = "Erro: " + error.message; document.getElementById('loginError').style.display = 'block'; }); };
window.criarConta = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return showToast("❌ Preencha e-mail e senha!", true); document.getElementById('loading-screen').style.display = 'flex'; auth.createUserWithEmailAndPassword(email, senha).then(() => { showToast("✅ Conta criada!"); }).catch(error => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('loginError').textContent = "Erro: " + error.message; document.getElementById('loginError').style.display = 'block'; }); };
window.fazerLogout = function() { if(confirm("Deseja sair?")) { auth.signOut(); location.reload(); } };
// ==========================================
// 4. UTILITÁRIOS, DATAS E FOTOS
// ==========================================

function isWithinDays(dateStr, dias) { 
    if (dias === 'Total' || !dias) return true; 
    if (!dateStr) return true; 
    var parts = dateStr.split('/'); 
    if (parts.length !== 3) return true; 
    var itemDate = new Date(parts[2], parts[1] - 1, parts[0]); 
    var today = new Date(); 
    itemDate.setHours(0,0,0,0); 
    today.setHours(0,0,0,0); 
    var diffDays = Math.floor((today - itemDate) / (1000 * 60 * 60 * 24)); 
    return diffDays <= parseInt(dias); 
}

window.getDeadlineMs = function(item) { 
    var ms = item.timestampCriacao || item.id; 
    if (item.prazoDias && parseLocal(item.prazoDias) > 0) { 
        var parts = (item.data || "").split('/'); 
        if (parts.length === 3) { 
            var baseTime = new Date(item.timestampCriacao || item.id); 
            if (isNaN(baseTime.getTime())) baseTime = new Date(); 
            var targetDate = new Date(parts[2], parts[1] - 1, parts[0], baseTime.getHours(), baseTime.getMinutes(), baseTime.getSeconds()); 
            var diasRestantes = parseLocal(item.prazoDias); 
            var diasAdicionados = 0; 
            while (diasAdicionados < diasRestantes) { 
                targetDate.setDate(targetDate.getDate() + 1); 
                if (targetDate.getDay() !== 0) diasAdicionados++; 
            } 
            ms = targetDate.getTime(); 
        } 
    } else if (item.posicaoFila) { 
        ms = item.posicaoFila; 
    } 
    if (item.urgente) { ms -= 31536000000; } 
    return ms; 
};

window.handleUploadMain = function(input) { var file = input.files[0]; if (!file) return; var formData = new FormData(); formData.append("image", file); document.getElementById('loading-screen').style.display = 'flex'; var h2 = document.getElementById('loading-screen').querySelector('h2'), oldText = h2.textContent; h2.textContent = "A anexar foto..."; fetch("https://api.imgbb.com/1/upload?key=50b2518403427e60b75a8074dc495b15", { method: "POST", body: formData }).then(r => r.json()).then(data => { document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText; if (data.success) { var url = data.data.display_url; document.getElementById('fotoUrlProjeto').value = url; salvarDinamico('fotoUrlProjeto'); var prev = document.getElementById('previewFotoMain'); prev.style.backgroundImage = `url('${url}')`; prev.style.display = "block"; showToast("📸 Foto anexada com sucesso!"); } else { showToast("❌ Erro no upload", true); } input.value = ""; }).catch(() => { document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText; showToast("❌ Erro de rede", true); input.value = ""; }); };
window.removerFotoMain = function() { if(confirm("Deseja remover esta foto do projeto?")) { document.getElementById('fotoUrlProjeto').value = ""; localStorage.removeItem('3d4y_dark_fotoUrlProjeto'); document.getElementById('previewFotoMain').style.display = "none"; document.getElementById('previewFotoMain').style.backgroundImage = "none"; } };
window.uploadingCatalogId = null;
window.handleUploadCat = function(input) { var file = input.files[0]; if (!file) return; var formData = new FormData(); formData.append("image", file); document.getElementById('loading-screen').style.display = 'flex'; var h2 = document.getElementById('loading-screen').querySelector('h2'), oldText = h2.textContent; h2.textContent = "A anexar foto..."; fetch("https://api.imgbb.com/1/upload?key=50b2518403427e60b75a8074dc495b15", { method: "POST", body: formData }).then(r => r.json()).then(data => { document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText; if (data.success) { var url = data.data.display_url; document.getElementById('fotoUrlCat').value = url; var prev = document.getElementById('previewFotoCat'); prev.style.backgroundImage = `url('${url}')`; prev.style.display = "block"; document.getElementById('btnRemoverFotoCat').style.display = "block"; showToast("📸 Foto pronta para salvar!"); } else { showToast("❌ Erro no upload", true); } input.value = ""; }).catch(() => { document.getElementById('loading-screen').style.display = 'none'; h2.textContent = oldText; showToast("❌ Erro de rede", true); input.value = ""; }); };
window.removerFotoCat = function() { var f = document.getElementById('fotoUrlCat'); if(f) f.value = ""; var p = document.getElementById('previewFotoCat'); if(p) { p.style.display = "none"; p.style.backgroundImage = "none"; } var b = document.getElementById('btnRemoverFotoCat'); if(b) b.style.display = "none"; };

window.toggleCard = function(id, el, event) { if(event && (event.target.tagName === 'INPUT' || event.target.classList.contains('slider-switch') || event.target.classList.contains('switch') || event.target.tagName === 'BUTTON')) return; var content = document.getElementById(id), chevron = el.querySelector('.chevron'); if(content.style.display === 'none') { content.style.display = 'block'; if(chevron) chevron.style.transform = 'rotate(0deg)'; } else { content.style.display = 'none'; if(chevron) chevron.style.transform = 'rotate(-90deg)'; } };
function atualizarListaClientes() { clientesCadastrados = {}; historico.forEach(function(item) { if (item.cliente && item.cliente.trim() !== '') { if (!clientesCadastrados[item.cliente] && item.telefone) { clientesCadastrados[item.cliente] = item.telefone; } } }); var dl = document.getElementById('listaClientes'); if (dl) { dl.innerHTML = ''; for (var c in clientesCadastrados) { dl.innerHTML += `<option value="${c}">`; } } }
function checarClienteAutoFill() { var nome = document.getElementById('nomeCliente').value; if (clientesCadastrados[nome]) { document.getElementById('telefoneCliente').value = clientesCadastrados[nome]; salvarDinamico('telefoneCliente'); } }
function mascaraData(el) { if(!el) return; var val = el.value.replace(/\D/g, ''); if(val.length > 8) val = val.slice(0, 8); if(val.length >= 5) { val = val.slice(0,2) + '/' + val.slice(2,4) + '/' + val.slice(4); } else if(val.length >= 3) { val = val.slice(0,2) + '/' + val.slice(2); } el.value = val; }
function aplicarMascara(el) { if (!el) return; var start = el.selectionStart, oldVal = el.value, partsDot = oldVal.split('.'); if (partsDot.length === 2 && oldVal.indexOf(',') === -1 && partsDot[1].length <= 3) { oldVal = oldVal.replace('.', ','); } var v = oldVal.replace(/\./g, '').replace(/[^0-9,]/g, ''), parts = v.split(','); if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join(''); var intPart = parts[0]; if (intPart) { if (intPart.length > 1 && intPart.charAt(0) === '0') { intPart = parseInt(intPart, 10).toString(); } intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "."); } var newVal = parts.length > 1 ? intPart + ',' + parts[1] : intPart; if (el.value !== newVal) { el.value = newVal; var newStart = start + (newVal.length - oldVal.length); if (newStart < 0) newStart = 0; try { el.setSelectionRange(newStart, newStart); } catch(e) {} } }
function mascaraTelefone(el) { if (!el) return; var val = el.value.replace(/\D/g, ''); if (val.length > 11) val = val.slice(0, 11); if (val.length > 2) val = '(' + val.slice(0,2) + ') ' + val.slice(2); if (val.length > 10) val = val.slice(0, 10) + '-' + val.slice(10); el.value = val; }
function formatarMoeda(num) { var n = parseFloat(num); if (isNaN(n)) return "0,00"; return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pegaValor(id) { var el = document.getElementById(id); if (!el || !el.value) return 0; return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0; }
function pegaTexto(id) { var el = document.getElementById(id); if (el) { return el.value || ''; } return ''; }
function parseLocal(val) { if (val === undefined || val === null || val === '') return 0; if (typeof val === 'number') return val; var str = val.toString(); if (str.includes(',') && str.includes('.')) { return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0; } if (str.includes(',')) { return parseFloat(str.replace(',', '.')) || 0; } return parseFloat(str) || 0; }
function salvarDinamico(idCampo) { var el = document.getElementById(idCampo); if (el) { localStorage.setItem('3d4y_dark_' + idCampo, el.value); } }
function salvarDinamicoValor(idCampo, valor) { var el = document.getElementById(idCampo); if (el) el.value = valor; localStorage.setItem('3d4y_dark_' + idCampo, valor); }
var dynIds = ['nomeProjeto', 'nomeCliente', 'telefoneCliente', 'pesoPeca', 'tempoH', 'valorPersonalizado', 'tipoFilamento1', 'corFilamento1', 'marcaFilamento1', 'qtdPecasProjeto', 'precoFixoCatMain', 'fotoUrlProjeto', 'dataProjeto', 'idPedidoMarketplace', 'obsVenda', 'prazoDias'];
function updateSliderProgress(slider) { if (!slider) return; var value = (slider.value - slider.min) / (slider.max - slider.min) * 100; slider.style.background = 'linear-gradient(to right, #3b82f6 ' + value + '%, #334155 ' + value + '%)'; }

// ==========================================
// 5. MODAIS E CONFIGURAÇÕES
// ==========================================

window.abrirConfigModal = function() { 
    window.oldBaseVals = { maq: pegaValor('maquina'), vid: pegaValor('vidaUtil'), con: pegaValor('consumoW'), kwh: pegaValor('precoKwh') }; 
    document.getElementById('configModal').style.display='block'; 
};

// 🔥 AQUI ESTAVA O SEU ERRO DO BOTÃO FECHAR!
window.fecharModal = function(idModal) { 
    var modal = document.getElementById(idModal);
    if(modal) modal.style.display = 'none'; 
    
    if (idModal === 'catalogoModal') { 
        var boxCat = document.getElementById('boxEditCat');
        if(boxCat) boxCat.style.display = 'none'; 
        window.removerFotoCat(); 
    } 
    
    if (idModal === 'configModal') { 
        var nMaq = pegaValor('maquina'), nVid = pegaValor('vidaUtil'), nCon = pegaValor('consumoW'), nKwh = pegaValor('precoKwh'); 
        if (nMaq > 0 && nVid > 0 && (nMaq !== window.oldBaseVals.maq || nVid !== window.oldBaseVals.vid || nCon !== window.oldBaseVals.con || nKwh !== window.oldBaseVals.kwh)) { 
            if(confirm("⚠️ Você alterou dados de Custo Operacional.\n\n[ OK ] Atualiza TODAS as vendas do histórico.\n[ CANCELAR ] Valerá apenas para vendas novas.")) { 
                var oldDep = window.oldBaseVals.maq / (window.oldBaseVals.vid || 1), oldEne = (window.oldBaseVals.con / 1000) * window.oldBaseVals.kwh, newDep = nMaq / (nVid || 1), newEne = (nCon / 1000) * nKwh, deltaPorHora = (newDep + newEne) - (oldDep + oldEne); 
                if (!isNaN(deltaPorHora) && isFinite(deltaPorHora)) { 
                    historico.forEach(h => { 
                        var hTempo = parseLocal(h.tempo) || 0; 
                        h.custo = (parseLocal(h.custo) || 0) + (deltaPorHora * hTempo); 
                        if(h.custo < 0) h.custo = 0; 
                        if(h.cartItems) { 
                            h.cartItems.forEach(ci => { 
                                var ciTempo = parseLocal(ci.tempo) || 0; 
                                ci.custo = (parseLocal(ci.custo) || 0) + (deltaPorHora * ciTempo); 
                                if(ci.custo < 0) ci.custo = 0; 
                            }); 
                        } 
                        salvarNoFirebase('historico', h); 
                    }); 
                    showToast("✅ Passado Atualizado com Sucesso!"); 
                } 
            } 
        } 
    } 
    
    if (idModal === 'logisticaModal') { 
        var nEmb = pegaValor('custoEmbalagem'), nDes = pegaValor('custoDeslocamento'), oldEmb = parseLocal(window.configGlobais.custoEmbalagem || "0"), oldDes = parseLocal(window.configGlobais.custoDeslocamento || "0"); 
        if (nEmb !== oldEmb || nDes !== oldDes) { 
            if(confirm("⚠️ Atualiza TODAS as vendas já feitas no histórico?\n\n[ OK ] Sim.\n[ CANCELAR ] Apenas novas.")) { 
                historico.forEach(h => { 
                    var novoLog = nEmb + nDes, deltaLogistica = novoLog - parseLocal(h.logistica || 0); 
                    h.logistica = novoLog; 
                    h.valorLiquido = (parseLocal(h.valorLiquido) || 0) - deltaLogistica; 
                    if (h.valorLiquido < 0) h.valorLiquido = 0; 
                    salvarNoFirebase('historico', h); 
                }); 
                showToast("✅ Logística Atualizada no Histórico!"); 
            } 
        } 
    } 
    
    syncNuvem(); 
    calcular(); 
};

window.resetarQA = function() { if(confirm("Manutenção realizada?")) { window.qaOffset = window.horasTotaisImpressasGlobal; syncNuvem(); document.getElementById('configModal').style.display='none'; showToast("🔧 Manutenção Zerada!"); } }

function descontarTaxas(valorBruto, qtdTotal, cartItemsArray) { 
    var feeShpTotal = 0, feeMlTotal = 0, txMl = pegaValor('taxaMeli') / 100;
    var items = (cartItemsArray && cartItemsArray.length > 0) ? cartItemsArray : (carrinho && carrinho.length > 0 ? carrinho : []);
    var isCart = items.length > 0;
    var vBrutoNum = parseLocal(valorBruto);
    
    if (isCart) {
        var cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento');
        var totBaseForRatio = items.reduce((a,b)=>a + parseLocal(b.valorComLucro || 0), 0) || 1;
        var simulatedGrossList = [], totalSimulatedGross = 0;
        
        items.forEach(i => {
            var iQtd = parseLocal(i.qtd || 1), iValLucro = parseLocal(i.valorComLucro || 0), iPrecoExato = parseLocal(i.precoVendaExato || 0);
            if (iPrecoExato > 0) { simulatedGrossList.push(iPrecoExato / iQtd); totalSimulatedGross += iPrecoExato; } 
            else {
                var itemRatio = iValLucro / totBaseForRatio, itemBaseTotal = iValLucro + (cLog * itemRatio), itemBaseUnit = itemBaseTotal / iQtd;
                var p1 = (itemBaseUnit + 4) / 0.80, p2 = (itemBaseUnit + 16) / 0.86, p3 = (itemBaseUnit + 20) / 0.86, p4 = (itemBaseUnit + 26) / 0.86, bestPShp;
                if (p1 <= 79.99) bestPShp = p1; else if (p2 <= 99.99) bestPShp = p2; else if (p3 <= 199.99) bestPShp = p3; else bestPShp = p4;
                var unitGross = Math.round(bestPShp * 100) / 100; simulatedGrossList.push(unitGross); totalSimulatedGross += (unitGross * iQtd);
            }
        });
        var scale = vBrutoNum / (totalSimulatedGross || 1);
        items.forEach((i, idx) => {
            var iQtd = parseLocal(i.qtd || 1), actualUnitGross = Math.round((simulatedGrossList[idx] * scale) * 100) / 100, feeSUnit = 0;
            if (actualUnitGross <= 79.99) feeSUnit = (Math.round(actualUnitGross * 0.20 * 100) / 100) + 4;
            else if (actualUnitGross <= 99.99) feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 16;
            else if (actualUnitGross <= 199.99) feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 20;
            else feeSUnit = (Math.round(actualUnitGross * 0.14 * 100) / 100) + 26;
            feeShpTotal += (feeSUnit * iQtd); 
            var fixMl = (actualUnitGross >= 79.99) ? 0 : pegaValor('fixaMeli'), feeMUnit = (Math.round(actualUnitGross * txMl * 100) / 100) + fixMl;
            feeMlTotal += (feeMUnit * iQtd);
        });
    } else {
        var qTotalLocal = parseLocal(qtdTotal); if (qTotalLocal < 1) qTotalLocal = 1;
        var avgBruto = Math.round((vBrutoNum / qTotalLocal) * 100) / 100, feeShpUnit = 0;
        if (avgBruto <= 79.99) feeShpUnit = (Math.round(avgBruto * 0.20 * 100) / 100) + 4;
        else if (avgBruto <= 99.99) feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 16;
        else if (avgBruto <= 199.99) feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 20;
        else feeShpUnit = (Math.round(avgBruto * 0.14 * 100) / 100) + 26;
        feeShpTotal = feeShpUnit * qTotalLocal;
        var fixMl = (avgBruto >= 79.99) ? 0 : pegaValor('fixaMeli'), feeMlUnit = (Math.round(avgBruto * txMl * 100) / 100) + fixMl;
        feeMlTotal = feeMlUnit * qTotalLocal;
    }
    var netShopee = vBrutoNum - feeShpTotal; if (netShopee < 0) netShopee = 0;
    var netMeli = vBrutoNum - feeMlTotal; if (netMeli < 0) netMeli = 0;
    return { shopee: netShopee, meli: netMeli }; 
}
// ==========================================
// 6. CARRINHO, CATÁLOGO, ESTOQUE E DESPESAS
// ==========================================

function limparFantasmasMultiCor() { for(var i=2; i<=15; i++) { localStorage.removeItem('3d4y_dark_tipoFilamento'+i); localStorage.removeItem('3d4y_dark_corFilamento'+i); localStorage.removeItem('3d4y_dark_marcaFilamento'+i); localStorage.removeItem('3d4y_dark_precoFilamento'+i); localStorage.removeItem('3d4y_dark_pesoPeca'+i); } var qCores=document.getElementById('qtdCoresExtras'); if(qCores) qCores.value="1"; if(typeof renderCoresExtras==='function') renderCoresExtras(); }
function resetarInputProjeto() { document.getElementById('nomeProjeto').value=""; document.getElementById('qtdPecasProjeto').value="1"; document.getElementById('tempoH').value=""; document.getElementById('pesoPeca').value=""; var sel1=document.getElementById('sel_est_1'); if(sel1) sel1.value=""; document.getElementById('tipoFilamento1').value=""; document.getElementById('corFilamento1').value=""; document.getElementById('marcaFilamento1').value=""; document.getElementById('precoFilamento').value="120,00"; document.getElementById('detalhes_1').style.display='none'; var tMulti=document.getElementById('toggle_multi_mat'); if(tMulti && tMulti.checked) { tMulti.checked=false; tMulti.dispatchEvent(new Event('change')); } document.getElementById('fotoUrlProjeto').value=""; var prev=document.getElementById('previewFotoMain'); if(prev) prev.style.display="none"; var dp=document.getElementById('dataProjeto'); if(dp) { dp.value=new Date().toLocaleDateString('pt-BR'); salvarDinamico('dataProjeto'); } ['nomeProjeto','qtdPecasProjeto','tempoH','pesoPeca','tipoFilamento1','corFilamento1','marcaFilamento1','precoFilamento','precoFixoCatMain','fotoUrlProjeto'].forEach(id=>localStorage.removeItem('3d4y_dark_'+id)); limparFantasmasMultiCor(); }
function preencherFormProjeto(prod) { var match=prod.nome.match(/^(\d+)x\s(.*)/), qtd=match?parseInt(match[1]):(prod.qtd||1), baseNome=match?match[2]:prod.nome; document.getElementById('nomeProjeto').value=baseNome; document.getElementById('qtdPecasProjeto').value=qtd; var matchCat=catalogo.find(c=>c.nome.toLowerCase().trim()===baseNome.toLowerCase().trim()), selCat=document.getElementById('sel_catalogo'); if(matchCat) { if(selCat) selCat.value=matchCat.id.toString(); } else { if(selCat) selCat.value=""; } var p_tipo1=prod.tipo1||(matchCat?matchCat.tipo1:""), p_cor1=prod.cor1||(matchCat?matchCat.cor1:""), p_marca1=prod.marca1||(matchCat?matchCat.marca1:""), p_preco1=prod.preco1||(matchCat?matchCat.preco1:"120,00"), p_multi=prod.multi!==undefined?prod.multi:(matchCat?matchCat.multi:false), p_qtdCores=prod.qtdCores||(matchCat?matchCat.qtdCores:"1"), p_extras=prod.extras||(matchCat?matchCat.extras:[]); document.getElementById('tempoH').value=prod.tempo1||(prod.tempo?formatarMoeda((prod.tempo)/qtd):(matchCat?matchCat.tempo:"")); document.getElementById('pesoPeca').value=prod.peso1||(prod.peso?formatarMoeda((prod.peso)/qtd):(matchCat?matchCat.peso1:"")); if(prod.taxaSucesso) document.getElementById('taxaSucesso').value=prod.taxaSucesso; if(prod.margemLucro) { document.getElementById('margemInput').value=prod.margemLucro; document.getElementById('margemSlider').value=prod.margemLucro; updateSliderProgress(document.getElementById('margemSlider')); } document.getElementById('tipoFilamento1').value=p_tipo1; document.getElementById('corFilamento1').value=p_cor1; document.getElementById('marcaFilamento1').value=p_marca1; document.getElementById('precoFilamento').value=p_preco1; var match1=null; if(p_tipo1) { match1=estoque.find(e=>e.tipo===p_tipo1&&e.cor===p_cor1&&e.marca===p_marca1)||estoque.find(e=>e.tipo===p_tipo1&&e.cor===p_cor1); } var sel1=document.getElementById('sel_est_1'); if(match1) { if(sel1) sel1.value=match1.id.toString(); document.getElementById('marcaFilamento1').value=match1.marca; document.getElementById('precoFilamento').value=match1.preco; } else { if(sel1) sel1.value=""; } document.getElementById('detalhes_1').style.display=(p_tipo1)?'block':'none'; var fotoUrl=prod.foto||(matchCat?matchCat.foto:""); document.getElementById('fotoUrlProjeto').value=fotoUrl; salvarDinamico('fotoUrlProjeto'); var preview=document.getElementById('previewFotoMain'); if(fotoUrl) { preview.style.backgroundImage=`url('${fotoUrl}')`; preview.style.display="block"; } else { preview.style.display="none"; } limparFantasmasMultiCor(); var tMulti=document.getElementById('toggle_multi_mat'); if(tMulti) { tMulti.checked=p_multi; tMulti.dispatchEvent(new Event('change')); } if(p_multi&&p_extras&&p_extras.length>0) { document.getElementById('qtdCoresExtras').value=p_qtdCores; p_extras.forEach((ex,idx)=>{ var i=idx+2; salvarDinamicoValor('tipoFilamento'+i,ex.tipo||""); salvarDinamicoValor('corFilamento'+i,ex.cor||""); salvarDinamicoValor('marcaFilamento'+i,ex.marca||""); salvarDinamicoValor('precoFilamento'+i,ex.preco||""); salvarDinamicoValor('pesoPeca'+i,ex.peso||""); }); renderCoresExtras(); p_extras.forEach((ex,idx)=>{ var i=idx+2; setTimeout(()=>{ var matchI=null; if(ex.tipo) { matchI=estoque.find(e=>e.tipo===ex.tipo&&e.cor===ex.cor&&e.marca===ex.marca)||estoque.find(e=>e.tipo===ex.tipo&&e.cor===ex.cor); } var selI=document.getElementById('sel_est_'+i); if(matchI) { if(selI) selI.value=matchI.id.toString(); document.getElementById('precoFilamento'+i).value=matchI.preco; document.getElementById('marcaFilamento'+i).value=matchI.marca; } else { if(selI) selI.value=""; } },50); }); } else { if(document.getElementById('qtdCoresExtras')) document.getElementById('qtdCoresExtras').value="1"; renderCoresExtras(); } ['nomeProjeto','qtdPecasProjeto','tempoH','pesoPeca'].forEach(id=>salvarDinamico(id)); calcular(); }

function adicionarAoCarrinho() { var nomeBase=pegaTexto('nomeProjeto')||"Sem Nome", qtdPecas=parseInt(pegaValor('qtdPecasProjeto'))||1; if(qtdPecas<1) qtdPecas=1; var nomeItem=qtdPecas>1?qtdPecas+"x "+nomeBase:nomeBase, tMulti=document.getElementById('toggle_multi_mat'), multiMatEnabled=tMulti?tMulti.checked:false, tempoItem=pegaValor('tempoH')*qtdPecas, pesoItem=pegaValor('pesoPeca')*qtdPecas, depCalc=(pegaValor('maquina')/(pegaValor('vidaUtil')||1))*tempoItem, eneCalc=(pegaValor('consumoW')/1000)*pegaValor('precoKwh')*tempoItem, precoMatCalc=pegaValor('precoFilamento'); if(precoMatCalc===0) precoMatCalc=120; var matTotalCalc=(precoMatCalc/1000)*pesoItem, materiaisArray=[], t1=pegaTexto('tipoFilamento1'), c1=pegaTexto('corFilamento1'), m1=pegaTexto('marcaFilamento1'), nomeMat1=(t1+' '+c1+' '+m1).trim(); if(nomeMat1==='') nomeMat1='Filamento 1'; if(pesoItem>0) materiaisArray.push(nomeMat1+' ('+pesoItem+'g)'); var extras=[]; if(multiMatEnabled) { var qtdEx=parseInt(pegaValor('qtdCoresExtras'))||1; for(var i=2; i<=qtdEx+1; i++) { var pesoE=pegaValor('pesoPeca'+i)*qtdPecas; pesoItem+=pesoE; var precoE=pegaValor('precoFilamento'+i); if(precoE===0) precoE=120; matTotalCalc+=(precoE/1000)*pesoE; var ti=pegaTexto('tipoFilamento'+i), ci=pegaTexto('corFilamento'+i), mi=pegaTexto('marcaFilamento'+i), nomeMatI=(ti+' '+ci+' '+mi).trim(); if(nomeMatI==='') nomeMatI='Filamento '+i; if(pesoE>0) materiaisArray.push(nomeMatI+' ('+pesoE+'g)'); extras.push({tipo:ti, cor:ci, marca:mi, preco:pegaTexto('precoFilamento'+i), peso:pegaTexto('pesoPeca'+i)}); } } var sucCalc=pegaValor('taxaSucesso'); if(sucCalc<=0) sucCalc=100; var custoItemCalc=(depCalc+eneCalc+matTotalCalc)/(sucCalc/100), mInputCalc=pegaValor('margemInput'), vDCalc=custoItemCalc+(custoItemCalc*(mInputCalc/100)); var canalSel=document.getElementById('canalVendaSelecionado'); var isPerso=canalSel&&canalSel.value==='Personalizado'; var valPerso=pegaValor('valorPersonalizado'); var precoExatoItem=(isPerso&&valPerso>0)?parseLocal(valPerso):0; var novoItem={id:editandoCarrinhoId?editandoCarrinhoId:Date.now()+Math.floor(Math.random()*1000), nome:nomeItem, qtd:qtdPecas, custo:custoItemCalc, valorComLucro:vDCalc, precoVendaExato:precoExatoItem, tempo:tempoItem, peso:pesoItem, materiais:(materiaisArray.length>0?materiaisArray.join(' + '):'Não informado'), tipo1:t1, cor1:c1, marca1:m1, preco1:document.getElementById('precoFilamento').value, peso1:document.getElementById('pesoPeca').value, tempo1:document.getElementById('tempoH').value, multi:multiMatEnabled, qtdCores:document.getElementById('qtdCoresExtras')?document.getElementById('qtdCoresExtras').value:"1", extras:extras, taxaSucesso:document.getElementById('taxaSucesso').value, margemLucro:document.getElementById('margemInput').value, foto:pegaTexto('fotoUrlProjeto')}; if(editandoCarrinhoId) { var idx=carrinho.findIndex(i=>i.id===editandoCarrinhoId); if(idx>-1) carrinho[idx]=novoItem; editandoCarrinhoId=null; var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent="➕ Adicionar Item"; btnAdd.style.background="var(--orange)"; } if(btnCancel) btnCancel.style.display="none"; showToast("🛒 Item atualizado no Pedido!"); } else { carrinho.push(novoItem); showToast("🛒 Item adicionado ao Pedido!"); } resetarInputProjeto(); if(canalSel) canalSel.value="Direta"; var elPerso=document.getElementById('valorPersonalizado'); if(elPerso) elPerso.value=''; localStorage.removeItem('3d4y_dark_valorPersonalizado'); var cbLiq=document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked=false; if(typeof mostrarValorPersonalizado==='function') mostrarValorPersonalizado(); renderCarrinho(); calcular(); }
function cancelarEdicaoCarrinho() { editandoCarrinhoId=null; var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent="➕ Adicionar Item"; btnAdd.style.background="var(--orange)"; } if(btnCancel) btnCancel.style.display="none"; resetarInputProjeto(); calcular(); showToast("❌ Edição cancelada"); }
function removerDoCarrinho(id) { carrinho=carrinho.filter(i=>i.id!==id); renderCarrinho(); calcular(); }
function editarItemCarrinho(id) { var item=carrinho.find(i=>i.id===id); if(!item) return; preencherFormProjeto(item); if(item.precoVendaExato&&parseLocal(item.precoVendaExato)>0) { var elCanal=document.getElementById('canalVendaSelecionado'); if(elCanal) elCanal.value='Personalizado'; var elPerso=document.getElementById('valorPersonalizado'); if(elPerso) { elPerso.value=formatarMoeda(parseLocal(item.precoVendaExato)); salvarDinamico('valorPersonalizado'); } if(typeof mostrarValorPersonalizado==='function') mostrarValorPersonalizado(); } editandoCarrinhoId=id; var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); if(btnAdd) { btnAdd.textContent="💾 Atualizar Item"; btnAdd.style.background="var(--purple)"; } if(btnCancel) btnCancel.style.display="block"; showToast("✏️ Item carregado para edição!"); window.scrollTo({top:0, behavior:'smooth'}); }
function renderCarrinho() { var container=document.getElementById('carrinho_container'); var lista=document.getElementById('lista_itens_carrinho'); if(!container||!lista) return; if(carrinho.length===0) { container.style.display='none'; return; } container.style.display='block'; var htmlFinal=""; var totCusto=0, totValorComLucro=0; carrinho.forEach(item=>{ totCusto+=parseLocal(item.custo); totValorComLucro+=parseLocal(item.valorComLucro); var htmlFoto=item.foto?`<div style="width:30px; height:30px; border-radius:4px; background-image:url('${item.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>`:''; var txtVendaBase=item.precoVendaExato&&parseLocal(item.precoVendaExato)>0?`Venda Fixada: R$ ${formatarMoeda(parseLocal(item.precoVendaExato))}`:`Venda Base: R$ ${formatarMoeda(parseLocal(item.valorComLucro))}`; htmlFinal+=`<div style="background: #0f172a; padding: 8px; border-radius: 8px; position: relative; border: 1px solid var(--border); display:flex; align-items:center;">${htmlFoto}<div style="flex:1;"><button onclick="editarItemCarrinho(${item.id})" style="position: absolute; right: 35px; top: 5px; background: none; border: none; color: var(--sky); font-size: 1rem; cursor: pointer;">✎</button><button onclick="removerDoCarrinho(${item.id})" style="position: absolute; right: 5px; top: 5px; background: none; border: none; color: #ef4444; font-size: 1rem; font-weight: bold; cursor: pointer;">×</button><div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); padding-right: 50px;">${item.nome}</div><div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 3px;">Custo Peça: R$ ${formatarMoeda(parseLocal(item.custo))} | ${txtVendaBase}</div></div></div>`; }); lista.innerHTML=htmlFinal; var totalQtd=carrinho.reduce((a,b)=>a+parseLocal(b.qtd),0); if(totalQtd<1) totalQtd=1; var cLog=pegaValor('custoEmbalagem')+pegaValor('custoDeslocamento'); var frete=pegaValor('valorFreteManual'); var totS=0, totM=0, totD=0, totBaseForRatio=totValorComLucro===0?1:totValorComLucro; carrinho.forEach(i=>{ var iQtd=parseLocal(i.qtd||1), iPrecoExato=parseLocal(i.precoVendaExato||0), iValLucro=parseLocal(i.valorComLucro||0); if(iPrecoExato>0) { totS+=iPrecoExato; totM+=iPrecoExato; totD+=iPrecoExato; } else { var itemRatio=iValLucro/totBaseForRatio, itemBaseTotal=iValLucro+(cLog*itemRatio), itemBaseUnit=itemBaseTotal/iQtd; var p1=(itemBaseUnit+4)/0.80, p2=(itemBaseUnit+16)/0.86, p3=(itemBaseUnit+20)/0.86, p4=(itemBaseUnit+26)/0.86, bestPShp; if(p1<=79.991) bestPShp=p1; else if(p2<=99.991) bestPShp=p2; else if(p3<=199.991) bestPShp=p3; else bestPShp=p4; totS+=(Math.round(bestPShp*100)/100)*iQtd; var txMl=pegaValor('taxaMeli')/100, pAvgML_noFix=itemBaseUnit/(1-txMl); var bestPMeli=(pAvgML_noFix>=79.99)?pAvgML_noFix:(itemBaseUnit+pegaValor('fixaMeli'))/(1-txMl); totM+=(Math.round(bestPMeli*100)/100)*iQtd; totD+=itemBaseTotal; } }); totD+=frete; document.getElementById('cart_tot_custo').textContent=formatarMoeda(totCusto); document.getElementById('cart_tot_vd').textContent=formatarMoeda(totD); document.getElementById('cart_tot_vs').textContent=formatarMoeda(totS); document.getElementById('cart_tot_vm').textContent=formatarMoeda(totM); }

window.cancelarEdicaoCatalogo = function() { editCatalogoId=null; var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background="var(--orange)"; } var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="none"; resetarInputProjeto(); document.getElementById('sel_catalogo').value=""; document.getElementById('boxPrecoFixo').style.display='none'; document.getElementById('precoFixoCatMain').value=""; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); calcular(); showToast("❌ Edição cancelada"); };
function salvarNoCatalogo() { var nome=pegaTexto('nomeProjeto'); if(!nome) { showToast("❌ Dê um nome ao projeto.", true); return; } var precoFixo=pegaTexto('precoFixoCatMain'), fotoUrl=pegaTexto('fotoUrlProjeto'), extras=[], multiOn=document.getElementById('toggle_multi_mat').checked; if(multiOn) { var qtd=parseInt(pegaValor('qtdCoresExtras'))||1; for(var i=2; i<=qtd+1; i++) { extras.push({tipo:pegaTexto('tipoFilamento'+i), cor:pegaTexto('corFilamento'+i), marca:pegaTexto('marcaFilamento'+i), preco:pegaTexto('precoFilamento'+i), peso:pegaTexto('pesoPeca'+i)}); } } var existe=catalogo.find(p=>p.nome.toLowerCase().trim()===nome.toLowerCase().trim()); if(editCatalogoId) { if(existe&&existe.id!==editCatalogoId) { showToast("❌ Nome já existe.", true); return; } var idx=catalogo.findIndex(p=>p.id===editCatalogoId); if(idx>-1) { var pAntigo=catalogo[idx]; var nomeMinusculo=(pAntigo.nome||"").toLowerCase().trim(); var vendasAfetadas=historico.filter(h=>{ if(h.vendaIsolada) return false; var nomeHistoricoClean=(h.nome||"").toLowerCase().trim().replace(/^\d+x\s/,''); return nomeHistoricoClean===nomeMinusculo; }); if(vendasAfetadas.length>0) { if(confirm(`Atualizar CUSTO em ${vendasAfetadas.length} vendas padrão deste produto no histórico?`)) { var nMaq=pegaValor('maquina'), nVid=pegaValor('vidaUtil'), nCon=pegaValor('consumoW'), nKwh=pegaValor('precoKwh'), custoHoraBase=(nMaq/(nVid||1))+((nCon/1000)*nKwh), novoTempoUnit=pegaValor('tempoH'), novoPesoUnit=pegaValor('pesoPeca'), precoFilamentoUnit=pegaValor('precoFilamento')||120, taxaSucesso=(pegaValor('taxaSucesso')||100)/100; vendasAfetadas.forEach(h=>{ var qtdItem=parseLocal(h.totalQtd||1); h.tempo=novoTempoUnit*qtdItem; h.peso=novoPesoUnit*qtdItem; h.custo=((h.tempo*custoHoraBase)+((h.peso*precoFilamentoUnit)/1000))/taxaSucesso; salvarNoFirebase('historico', h); }); } } pAntigo.nome=nome; pAntigo.precoFixo=precoFixo; pAntigo.peso1=pegaTexto('pesoPeca'); pAntigo.tipo1=pegaTexto('tipoFilamento1'); pAntigo.cor1=pegaTexto('corFilamento1'); pAntigo.marca1=pegaTexto('marcaFilamento1'); pAntigo.preco1=pegaTexto('precoFilamento'); pAntigo.tempo=pegaTexto('tempoH'); pAntigo.multi=multiOn; pAntigo.qtdCores=multiOn?pegaTexto('qtdCoresExtras'):"0"; pAntigo.extras=extras; pAntigo.foto=fotoUrl; salvarNoFirebase('catalogo', pAntigo); } editCatalogoId=null; var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background="var(--orange)"; } var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="none"; showToast("🏷️ Produto atualizado no catálogo!"); } else { if(existe) { showToast("❌ O projeto JÁ EXISTE no Catálogo!", true); return; } var novoProduto={id:Date.now(), nome:nome, precoFixo:precoFixo, peso1:pegaTexto('pesoPeca'), tipo1:pegaTexto('tipoFilamento1'), cor1:pegaTexto('corFilamento1'), marca1:pegaTexto('marcaFilamento1'), preco1:pegaTexto('precoFilamento'), tempo:pegaTexto('tempoH'), multi:multiOn, qtdCores:multiOn?pegaTexto('qtdCoresExtras'):"0", extras:extras, foto:fotoUrl}; salvarNoFirebase('catalogo', novoProduto); showToast("🏷️ Produto salvo no catálogo!"); } document.getElementById('precoFixoCatMain').value=""; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); document.getElementById('boxPrecoFixo').style.display='none'; resetarDados(); }
function renderCatalogo() { var sel=document.getElementById('sel_catalogo'); var lista=document.getElementById('lista_catalogo'); if(!sel||!lista) return; var htmlSel='<option value="">-- Escolher produto cadastrado --</option>'; var htmlLista='<div style="margin-bottom:15px; text-align:center;"><button onclick="sincronizarTudoComCatalogo()" style="background:var(--purple); width:100%; padding:10px; border-radius:8px; color:#fff; font-weight:bold; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:8px; transition:0.2s;"><span style="font-size:1.2rem">🔄</span> Sincronizar CUSTOS com o Catálogo Atual</button></div>'; if(catalogo.length===0) { htmlLista+='<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Nenhum produto cadastrado</p>'; } else { catalogo.forEach(function(p) { htmlSel+=`<option value="${p.id}">${p.nome}</option>`; var pesoTotal=parseLocal(p.peso1); if(p.multi&&p.extras&&p.extras.length>0) { p.extras.forEach(function(ex) { pesoTotal+=parseLocal(ex.peso); }); } var pesoStr=formatarMoeda(pesoTotal)+'g', htmlPrecoFixo=p.precoFixo&&parseFloat(p.precoFixo.replace('.','').replace(',','.'))>0?' | Venda Fixo: R$ '+p.precoFixo:'', htmlFoto=p.foto?`<div style="width:40px; height:40px; border-radius:6px; background-image:url('${p.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>`:''; htmlLista+=`<div class="history-item"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">${htmlFoto}<div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; word-wrap: break-word;">${p.nome}</h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Tempo: ${p.tempo}h | Peso Total: ${pesoStr}${htmlPrecoFixo}</div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarDoCatalogo(${p.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerDoCatalogo(${p.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`; }); } sel.innerHTML=htmlSel; lista.innerHTML=htmlLista; }
function carregarDoCatalogo() { var id=document.getElementById('sel_catalogo').value; if(!id) { resetarInputProjeto(); document.getElementById('canalVendaSelecionado').value="Direta"; document.getElementById('valorPersonalizado').value=""; mostrarValorPersonalizado(); var boxPreco=document.getElementById('boxPrecoFixo'); if(boxPreco) boxPreco.style.display='none'; document.getElementById('precoFixoCatMain').value=''; calcular(); return; } aplicarDadosNoForm(id, false); showToast("🏷️ Dados carregados!"); }
function editarDoCatalogo(id) { aplicarDadosNoForm(id, true); editCatalogoId=id; var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Confirmar Edição no Catálogo"; btnMain.style.background="var(--sky)"; } var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="inline-block"; window.fecharModal('catalogoModal'); window.fecharGaveta(); window.scrollTo({top:0, behavior:'smooth'}); var dash=document.querySelector('.dashboard'); if(dash) dash.scrollTo({top:0, behavior:'smooth'}); showToast("✏️ Produto carregado para edição!"); }
function aplicarDadosNoForm(id, isEditing=false) { var p=catalogo.find(e=>e.id.toString()===id.toString()); if(!p) return; var fakeProd={nome:p.nome, qtd:1, tempo1:p.tempo, peso1:p.peso1, tipo1:p.tipo1, cor1:p.cor1, marca1:p.marca1, preco1:p.preco1, multi:p.multi, qtdCores:p.qtdCores, extras:p.extras, foto:p.foto}; preencherFormProjeto(fakeProd); var elPrecoFixo=document.getElementById('precoFixoCatMain'); var boxPreco=document.getElementById('boxPrecoFixo'); if(isEditing) { if(elPrecoFixo&&boxPreco) { boxPreco.style.display='flex'; elPrecoFixo.value=p.precoFixo||''; salvarDinamico('precoFixoCatMain'); } } else { if(boxPreco) boxPreco.style.display='none'; if(elPrecoFixo) { elPrecoFixo.value=''; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); } } if(p.precoFixo&&parseFloat(p.precoFixo.replace('.','').replace(',','.'))>0) { document.getElementById('canalVendaSelecionado').value='Personalizado'; document.getElementById('valorPersonalizado').value=p.precoFixo; salvarDinamico('valorPersonalizado'); mostrarValorPersonalizado(); } else { document.getElementById('canalVendaSelecionado').value='Direta'; document.getElementById('valorPersonalizado').value=''; salvarDinamico('valorPersonalizado'); mostrarValorPersonalizado(); } calcular(); }
function removerDoCatalogo(id) { if(confirm("Deseja apagar este produto do catálogo?")) { apagarNoFirebase('catalogo', id); } }

window.cancelarEdicaoEstoque = function() { editEstoqueId=null; document.getElementById('est_tipo').value=""; document.getElementById('est_cor').value=""; document.getElementById('est_marca').value=""; document.getElementById('est_preco').value=""; document.getElementById('btn_salvar_estoque').textContent="➕ Salvar"; document.getElementById('btn_cancelar_estoque').style.display="none"; showToast("❌ Edição cancelada"); };
function salvarItemEstoque() { var t=pegaTexto('est_tipo'), c=pegaTexto('est_cor'), m=pegaTexto('est_marca'), p=document.getElementById('est_preco').value; if(!t||!p) { showToast("❌ Preencha pelo menos o Tipo e o Preço.", true); return; } if(editEstoqueId) { var item=estoque.find(e=>e.id===editEstoqueId); if(item) { item.tipo=t; item.cor=c; item.marca=m; item.preco=p; let novoP=prompt("Peso atual da bobina em gramas (Ex: 1000):", item.pesoAtual!==undefined?item.pesoAtual:1000); if(novoP!==null) item.pesoAtual=parseLocal(novoP); salvarNoFirebase('estoque', item); } editEstoqueId=null; document.getElementById('btn_salvar_estoque').textContent="➕ Salvar / Atualizar"; document.getElementById('btn_cancelar_estoque').style.display="none"; showToast("📦 Estoque Atualizado!"); } else { let novoP=prompt("Peso inicial desta bobina em gramas (Ex: 1000):", "1000"); let pesoSalvar=novoP!==null?parseLocal(novoP):1000; var novo={id:Date.now(), tipo:t, cor:c, marca:m, preco:p, pesoAtual:pesoSalvar}; salvarNoFirebase('estoque', novo); showToast("📦 Estoque Adicionado!"); } document.getElementById('est_tipo').value=""; document.getElementById('est_cor').value=""; document.getElementById('est_marca').value=""; document.getElementById('est_preco').value=""; }
function renderEstoque() { var lista=document.getElementById('lista_estoque'); if(!lista) return; if(estoque.length===0) { lista.innerHTML='<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Estoque Vazio</p>'; } else { var htmlFinal=""; estoque.forEach(function(item) { var pesoAtual=item.pesoAtual!==undefined?item.pesoAtual:1000; var corPeso=pesoAtual<200?'#ef4444':(pesoAtual<500?'#facc15':'#10b981'); htmlFinal+=`<div class="history-item"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;"><div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; color:var(--success); word-wrap: break-word;">${item.tipo} ${item.cor} <span style="color:#fff">(${item.marca})</span></h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Preço: R$ ${item.preco} | <span style="color:${corPeso}; font-weight:bold;">Restante: ${formatarMoeda(pesoAtual)}g</span></div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarItemEstoque(${item.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerItemEstoque(${item.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`; }); lista.innerHTML=htmlFinal; } atualizarDropdownsEstoque(); }
function removerItemEstoque(id) { if(confirm("Deseja apagar este material do estoque?")) { apagarNoFirebase('estoque', id); } }
function editarItemEstoque(id) { var item=estoque.find(e=>e.id===id); if(item) { document.getElementById('est_tipo').value=item.tipo; document.getElementById('est_cor').value=item.cor; document.getElementById('est_marca').value=item.marca; document.getElementById('est_preco').value=item.preco; editEstoqueId=id; document.getElementById('btn_salvar_estoque').textContent="💾 Confirmar Edição"; document.getElementById('btn_cancelar_estoque').style.display="block"; } }
function atualizarDropdownsEstoque() { var optionsHTML='<option value="">-- Puxar material do Estoque --</option>'; estoque.forEach(function(item) { optionsHTML+='<option value="'+item.id+'">'+(item.tipo+' '+item.cor+' ('+item.marca+') - R$ '+item.preco).trim()+'</option>'; }); var s1=document.getElementById('sel_est_1'); if(s1) { var val1=s1.value; s1.innerHTML=optionsHTML; s1.value=val1; } var qtd=parseInt(pegaValor('qtdCoresExtras'))||1; for(var i=2; i<=qtd+1; i++) { var si=document.getElementById('sel_est_'+i); if(si) { var vali=si.value; si.innerHTML=optionsHTML; si.value=vali; } } }
function puxarDoEstoque(indexStr) { var sel=document.getElementById('sel_est_'+indexStr), det=document.getElementById('detalhes_'+indexStr); if(!sel||!sel.value) { if(det) det.style.display='none'; return; } var item=estoque.find(e=>e.id.toString()===sel.value); if(!item) return; var idx=parseInt(indexStr), sTipo=idx===1?'tipoFilamento1':'tipoFilamento'+idx, sCor=idx===1?'corFilamento1':'corFilamento'+idx, sMarca=idx===1?'marcaFilamento1':'marcaFilamento'+idx, sPreco=idx===1?'precoFilamento':'precoFilamento'+idx; var elT=document.getElementById(sTipo); if(elT) { elT.value=item.tipo; salvarDinamico(sTipo); } var elC=document.getElementById(sCor); if(elC) { elC.value=item.cor; salvarDinamico(sCor); } var elM=document.getElementById(sMarca); if(elM) { elM.value=item.marca; salvarDinamico(sMarca); } var elP=document.getElementById(sPreco); if(elP) { elP.value=item.preco; aplicarMascara(elP); salvarDinamico(sPreco); } if(det) det.style.display='block'; var campoPeso=idx===1?document.getElementById('pesoPeca'):document.getElementById('pesoPeca'+idx); if(campoPeso) { campoPeso.focus(); if(campoPeso.value==="0"||campoPeso.value==="0,00"||campoPeso.value==="") { campoPeso.select(); } } calcular(); showToast("📦 "+item.tipo+" Carregado!"); }
function renderCoresExtras() { var qtdInput=document.getElementById('qtdCoresExtras'); if(!qtdInput) return; var qtd=parseInt(pegaValor('qtdCoresExtras'))||1, container=document.getElementById('container_cores_extras'); if(!container) return; var htmlFinal=""; for(var i=2; i<=qtd+1; i++) { var sTipo=localStorage.getItem('3d4y_dark_tipoFilamento'+i)||'', sCor=localStorage.getItem('3d4y_dark_corFilamento'+i)||'', sMarca=localStorage.getItem('3d4y_dark_marcaFilamento'+i)||'', sPreco=localStorage.getItem('3d4y_dark_precoFilamento'+i)||'', sPeso=localStorage.getItem('3d4y_dark_pesoPeca'+i)||''; if(sPreco.indexOf('.')!==-1&&sPreco.indexOf(',')===-1) sPreco=sPreco.replace(/\./g,','); if(sPeso.indexOf('.')!==-1&&sPeso.indexOf(',')===-1) sPeso=sPeso.replace(/\./g,','); htmlFinal+=`<div class="filament-box" style="margin-top:10px;"><span class="filament-box-title">Filamento ${i}</span><div class="input-group" style="margin-bottom: 8px;"><select id="sel_est_${i}" style="border-color: var(--success); color: var(--success); background: rgba(16, 185, 129, 0.05);" onchange="puxarDoEstoque('${i}')"><option value="">-- Puxar material do Estoque --</option></select></div><div id="detalhes_${i}" class="detalhes-material" style="${sTipo?'display:block':''}"><div class="grid-3" style="margin-bottom: 8px;"><div class="input-group"><label>Tipo</label><input type="text" id="tipoFilamento${i}" value="${sTipo}" placeholder="Ex: PETG" readonly></div><div class="input-group"><label>Cor</label><input type="text" id="corFilamento${i}" value="${sCor}" placeholder="Ex: Branco" readonly></div><div class="input-group"><label>Marca</label><input type="text" id="marcaFilamento${i}" value="${sMarca}" placeholder="Ex: 3DLab" readonly></div></div><div class="input-group"><label>Preço Pago (R$/kg)</label><input type="text" inputmode="decimal" id="precoFilamento${i}" value="${sPreco}" readonly></div></div><div class="input-group" style="margin-top: 10px;"><label style="color: var(--sky); font-weight: 800;">Peso da Peça (g)</label><input type="text" inputmode="decimal" id="pesoPeca${i}" value="${sPeso}" class="peso-destaque" placeholder="0" oninput="aplicarMascara(this); salvarDinamico('pesoPeca${i}'); calcular()"></div></div>`; } container.innerHTML=htmlFinal; for(var i=2; i<=qtd+1; i++) { aplicarMascara(document.getElementById('pesoPeca'+i)); } atualizarDropdownsEstoque(); calcular(); }

function mostrarValorPersonalizado() { var seletor=document.getElementById('canalVendaSelecionado'), divPersonalizado=document.getElementById('divValorPersonalizado'); if(seletor&&divPersonalizado) { if(seletor.value==='Personalizado') { divPersonalizado.style.display='block'; } else { divPersonalizado.style.display='none'; } } }
function calcularSimulador() { var vVenda=pegaValor('simuladorVenda'), elS=document.getElementById('sim_shopee'), elM=document.getElementById('sim_meli'); if(vVenda<=0) { if(elS) elS.textContent="0,00"; if(elM) elM.textContent="0,00"; return; } var isCart=carrinho&&carrinho.length>0, totalQtd=isCart?carrinho.reduce((a,b)=>a+b.qtd,0):(parseInt(pegaValor('qtdPecasProjeto'))||1); if(totalQtd<1) totalQtd=1; var net=descontarTaxas(vVenda, totalQtd, isCart?carrinho:null); if(elS) elS.textContent=formatarMoeda(net.shopee); if(elM) elM.textContent=formatarMoeda(net.meli); }

window.cancelarEdicaoDespesa = function() { editDespesaId=null; document.getElementById('desp_qtd').value="1"; document.getElementById('desp_nome').value=""; document.getElementById('desp_valor').value=""; var elDD=document.getElementById('dataDespesa'); if(elDD) elDD.value=new Date().toLocaleDateString('pt-BR'); document.getElementById('btn_salvar_despesa').textContent="➕ Adicionar"; document.getElementById('btn_cancelar_despesa').style.display="none"; showToast("❌ Edição cancelada"); };
function salvarDespesa() { var qtd=parseInt(pegaValor('desp_qtd'))||1, nome=pegaTexto('desp_nome'), val=document.getElementById('desp_valor').value, dataInput=pegaTexto('dataDespesa')||new Date().toLocaleDateString('pt-BR'); if(!nome||!val) { showToast("❌ Preencha o produto/material e o valor.", true); return; } if(editDespesaId) { var item=despesas.find(d=>d.id===editDespesaId); if(item) { item.qtd=qtd; item.nome=nome; item.valor=parseLocal(val); item.data=dataInput; salvarNoFirebase('despesas', item); } editDespesaId=null; document.getElementById('btn_salvar_despesa').textContent="➕ Adicionar"; document.getElementById('btn_cancelar_despesa').style.display="none"; showToast("💸 Despesa Atualizada!"); } else { var nova={id:Date.now(), data:dataInput, qtd:qtd, nome:nome, valor:parseLocal(val)}; salvarNoFirebase('despesas', nova); showToast("💸 Despesa Registrada!"); } document.getElementById('desp_qtd').value="1"; document.getElementById('desp_nome').value=""; document.getElementById('desp_valor').value=""; var elDD=document.getElementById('dataDespesa'); if(elDD) elDD.value=new Date().toLocaleDateString('pt-BR'); }
function renderDespesas() { 
    var lista=document.getElementById('lista_despesas'); if(!lista) return; 
    var despesasFiltradas = despesas; 
    if(despesasFiltradas.length===0) { 
        lista.innerHTML='<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Nenhuma despesa registrada</p>'; 
        var td0=document.getElementById('tot_despesas'); if(td0) td0.textContent="0,00"; 
    } else { 
        var htmlFinal=""; var soma=0; 
        despesasFiltradas.forEach(function(d) { 
            soma+=d.valor; 
            htmlFinal+=`<div class="history-item" style="border-color: rgba(239, 68, 68, 0.3);"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;"><div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; color:var(--danger); word-wrap: break-word;">${d.qtd}x ${d.nome}</h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Valor Total: R$ ${formatarMoeda(d.valor)} <span style="opacity:0.5; font-size:0.6rem; margin-left:10px;">${d.data}</span></div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarDespesa(${d.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerDespesa(${d.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`; 
        }); 
        lista.innerHTML=htmlFinal; 
        var td=document.getElementById('tot_despesas'); if(td) td.textContent=formatarMoeda(soma); 
    } 
    atualizarLucroReal(); 
}
function removerDespesa(id) { if(confirm("Deseja apagar esta despesa?")) { apagarNoFirebase('despesas', id); } }
function editarDespesa(id) { var d=despesas.find(e=>e.id===id); if(d) { document.getElementById('desp_qtd').value=d.qtd; document.getElementById('desp_nome').value=d.nome; document.getElementById('desp_valor').value=formatarMoeda(d.valor); var elDD=document.getElementById('dataDespesa'); if(elDD) elDD.value=d.data||new Date().toLocaleDateString('pt-BR'); editDespesaId=id; document.getElementById('btn_salvar_despesa').textContent="💾 Confirmar Edição"; document.getElementById('btn_cancelar_despesa').style.display="block"; } }
// ==========================================
// 12. CÁLCULOS E VENDAS E HISTÓRICO
// ==========================================

function atualizarLucroReal() { 
    var valLucro = parseLocal(document.getElementById('tot_lucro').textContent), valDesp = parseLocal(document.getElementById('tot_despesas').textContent), real = valLucro - valDesp, elReal = document.getElementById('tot_lucro_real'); if(elReal) elReal.textContent = formatarMoeda(real); 
    
    var wrapTotals = document.querySelector('#wrap_hist_totals .total-summary');
    if (wrapTotals && !document.getElementById('tot_abs_caixa')) {
        var divAbs = document.createElement('div');
        divAbs.style = "margin-top: 15px; padding-top: 15px; border-top: 2px dashed rgba(56, 189, 248, 0.4);";
        divAbs.innerHTML = '<span style="font-size: 0.75rem; font-weight: 900; color: var(--sky); text-transform: uppercase;">🏆 Totais Absolutos (Todo o Histórico)</span><div class="total-row" style="margin-top: 8px;"><span style="font-weight: bold; color: #fff;">TOTAL DE VENDAS GERAL:</span><b style="color: #fff; font-size: 1.1rem;" id="tot_abs_qtd">0</b></div><div class="total-row" style="margin-top: 4px;"><span style="font-weight: bold; color: #fff;">CAIXA REAL GERAL:</span><b style="color: var(--sky); font-size: 1.1rem;">R$ <span id="tot_abs_caixa">0,00</span></b></div><div class="total-row" style="margin-top: 8px;"><span>Total PIX / Direta (<span id="qtd_abs_direta">0</span>):</span><b style="color: var(--success);">R$ <span id="tot_abs_direta">0,00</span></b></div><div class="total-row"><span>Total Shopee (<span id="qtd_abs_shopee">0</span>):</span><b style="color: var(--shopee);">R$ <span id="tot_abs_shopee">0,00</span></b></div><div class="total-row"><span>Total M. Livre (<span id="qtd_abs_meli">0</span>):</span><b style="color: var(--meli);">R$ <span id="tot_abs_meli">0,00</span></b></div>';
        wrapTotals.appendChild(divAbs);
    }
    
    var absShopee = 0, absMeli = 0, absDireta = 0, absLucro = 0, absDespesas = 0, absQtd = 0, absQtdShopee = 0, absQtdMeli = 0, absQtdDireta = 0;
    historico.forEach(function(item) {
        var st = item.status || "Finalizado";
        if (st !== 'Orçamento' && st !== 'Devolução') {
            var custoItem = parseLocal(item.custo), freteLogItem = parseLocal(item.frete || 0) + parseLocal(item.logistica || 0), canalStr = item.canal || "Direta";
            var valLiq = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix));
            absLucro += (valLiq - custoItem - freteLogItem);
            absQtd++;
            if(canalStr === "Shopee") { absShopee += valLiq; absQtdShopee++; } else if(canalStr === "Meli") { absMeli += valLiq; absQtdMeli++; } else { absDireta += valLiq; absQtdDireta++; }
        }
    });
    despesas.forEach(function(d) { absDespesas += parseLocal(d.valor); });
    
    var absCaixa = absLucro - absDespesas;
    
    var elAbsCaixa = document.getElementById('tot_abs_caixa'); if(elAbsCaixa) elAbsCaixa.textContent = formatarMoeda(absCaixa);
    var elAbsQtd = document.getElementById('tot_abs_qtd'); if(elAbsQtd) elAbsQtd.textContent = absQtd;
    var elAbsDireta = document.getElementById('tot_abs_direta'); if(elAbsDireta) elAbsDireta.textContent = formatarMoeda(absDireta);
    var elAbsShopee = document.getElementById('tot_abs_shopee'); if(elAbsShopee) elAbsShopee.textContent = formatarMoeda(absShopee);
    var elAbsMeli = document.getElementById('tot_abs_meli'); if(elAbsMeli) elAbsMeli.textContent = formatarMoeda(absMeli);
    var elQtdDir = document.getElementById('qtd_abs_direta'); if(elQtdDir) elQtdDir.textContent = absQtdDireta;
    var elQtdShp = document.getElementById('qtd_abs_shopee'); if(elQtdShp) elQtdShp.textContent = absQtdShopee;
    var elQtdMel = document.getElementById('qtd_abs_meli'); if(elQtdMel) elQtdMel.textContent = absQtdMeli;
}

window.cancelarEdicaoVenda = function() { editHistoricoId = null; document.getElementById('btn_salvar_venda_main').textContent = "💾 Salvar Venda"; document.getElementById('btn_salvar_venda_main').style.background = "var(--purple)"; var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "none"; resetarDados(); showToast("❌ Edição de venda cancelada"); }

window.moverFila = function(id, direcao) {
    var filaItems = historico.filter(h => h.status === 'Na Fila');
    filaItems.sort((a, b) => { var valA = a.posicaoFilaManual || window.getDeadlineMs(a); var valB = b.posicaoFilaManual || window.getDeadlineMs(b); return valA - valB; });
    var index = filaItems.findIndex(h => h.id === id); if (index < 0) return;
    var swapIndex = index + direcao; if (swapIndex < 0 || swapIndex >= filaItems.length) return;
    var itemAtual = filaItems[index], itemTroca = filaItems[swapIndex];
    var posAtual = itemAtual.posicaoFilaManual || window.getDeadlineMs(itemAtual);
    var posTroca = itemTroca.posicaoFilaManual || window.getDeadlineMs(itemTroca);
    if (posAtual === posTroca) { if(direcao === -1) posTroca -= 1; else posTroca += 1; }
    itemAtual.posicaoFilaManual = posTroca; itemTroca.posicaoFilaManual = posAtual;
    salvarNoFirebase('historico', itemAtual); salvarNoFirebase('historico', itemTroca);
};

window.isDraggingFiltro = false; window.mudarFiltro = function(status) { if (window.isDraggingFiltro) return; window.filtroStatusAtual = status; renderHistorico(); };
window.onload = function() {
    var divPerso = document.getElementById('divValorPersonalizado');
    if (divPerso && !document.getElementById('boxLiquidoExato')) { var elCB = document.createElement('div'); elCB.id = 'boxLiquidoExato'; elCB.style = 'margin-top: 12px; display: flex; align-items: center; gap: 8px; background: rgba(56, 189, 248, 0.1); padding: 10px; border-radius: 6px; border: 1px dashed rgba(56, 189, 248, 0.4);'; elCB.innerHTML = '<input type="checkbox" id="isLiquidoExato" style="width:18px;height:18px;accent-color:var(--sky);cursor:pointer;"><label for="isLiquidoExato" style="font-size:0.75rem;color:var(--sky);cursor:pointer;font-weight:600;line-height:1.2;">A Taxa deu diferença?<br><span style="font-size:0.6rem;font-weight:normal;opacity:0.8;">Marque aqui e digite acima apenas o LÍQUIDO EXATO que vai receber.</span></label>'; divPerso.appendChild(elCB); }
    var elDataP = document.getElementById('dataProjeto'); if (elDataP) { if (!elDataP.value) elDataP.value = new Date().toLocaleDateString('pt-BR'); elDataP.addEventListener('input', function() { mascaraData(this); salvarDinamico('dataProjeto'); }); }
    var elDataD = document.getElementById('dataDespesa'); if (elDataD) { if (!elDataD.value) elDataD.value = new Date().toLocaleDateString('pt-BR'); elDataD.addEventListener('input', function() { mascaraData(this); }); }
    var idsSave = ['margemSlider', 'margemInput', 'taxaMeli', 'fixaMeli', 'qtdPecasProjeto', 'desp_qtd', 'desp_valor', 'toggle_urgente'];
    idsSave.forEach(function(id) { var el = document.getElementById(id); if (el && el.dataset && el.dataset.save) { var saved = localStorage.getItem('3d4y_dark_' + id); if (saved !== null) { if (el.type === 'checkbox') { el.checked = (saved === 'true'); } else { if (saved.indexOf('.') !== -1 && saved.indexOf(',') === -1) { saved = saved.replace(/\./g, ','); } el.value = saved; } } } if (el) { if (el.tagName === 'INPUT' && el.type === 'text') { aplicarMascara(el); } el.addEventListener('input', function() { if (id === 'margemSlider') { var mInp = document.getElementById('margemInput'); if(mInp) { mInp.value = el.value; aplicarMascara(mInp); } updateSliderProgress(el); } if (id === 'margemInput') { var mSli = document.getElementById('margemSlider'); if(mSli) { mSli.value = pegaValor('margemInput'); updateSliderProgress(mSli); } } if (id === 'pesoPeca' || id === 'tempoH' || id === 'qtdPecasProjeto') calcular(); }); } });
    dynIds.forEach(function(id) { var el = document.getElementById(id); if(el) { var saved = localStorage.getItem('3d4y_dark_' + id); if (saved !== null) { if (id !== 'nomeProjeto' && id !== 'nomeCliente' && id !== 'telefoneCliente' && id !== 'tipoFilamento1' && id !== 'corFilamento1' && id !== 'marcaFilamento1' && id !== 'qtdPecasProjeto' && id !== 'precoFixoCatMain' && id !== 'fotoUrlProjeto' && id !== 'dataProjeto' && id !== 'idPedidoMarketplace' && id !== 'obsVenda' && id !== 'prazoDias') { if (saved.indexOf('.') !== -1 && saved.indexOf(',') === -1) { saved = saved.replace(/\./g, ','); } } el.value = saved; if (id === 'pesoPeca' || id === 'tempoH' || id === 'valorPersonalizado' || id === 'precoFixoCatMain') { aplicarMascara(el); } if (id === 'telefoneCliente') { mascaraTelefone(el); } } } });
    var savedFoto = localStorage.getItem('3d4y_dark_fotoUrlProjeto'); if(savedFoto) { var p = document.getElementById('previewFotoMain'); if(p) { p.style.backgroundImage = `url('${savedFoto}')`; p.style.display = "block"; } }
    var elQtd = document.getElementById('qtdPecasProjeto'); if(elQtd && (!elQtd.value || elQtd.value === "0")) { elQtd.value = "1"; salvarDinamico('qtdPecasProjeto'); }
    var tMulti = document.getElementById('toggle_multi_mat'), sMulti = document.getElementById('secao_multi_mat'); if(tMulti && sMulti) { tMulti.addEventListener('change', () => { sMulti.style.display = tMulti.checked ? 'block' : 'none'; localStorage.setItem('3d4y_dark_toggle_multi_mat', tMulti.checked); if(!tMulti.checked) { limparFantasmasMultiCor(); } calcular(); }); sMulti.style.display = tMulti.checked ? 'block' : 'none'; }
    var qCores = document.getElementById('qtdCoresExtras'); if(qCores) { qCores.addEventListener('input', renderCoresExtras); } if(pegaTexto('tipoFilamento1')) document.getElementById('detalhes_1').style.display = 'block';
    renderCoresExtras(); var mSli = document.getElementById('margemSlider'); if(mSli) { updateSliderProgress(mSli); } if(pegaTexto('precoFixoCatMain')) { document.getElementById('boxPrecoFixo').style.display = 'flex'; } calcular(); mostrarValorPersonalizado();
    var sliderFiltro = document.getElementById('filtroHistorico'), isDown = false, startX, scrollLeft;
    if(sliderFiltro) { sliderFiltro.style.cursor = 'grab'; sliderFiltro.addEventListener('mousedown', (e) => { isDown = true; window.isDraggingFiltro = false; sliderFiltro.style.cursor = 'grabbing'; startX = e.pageX - sliderFiltro.offsetLeft; scrollLeft = sliderFiltro.scrollLeft; }); sliderFiltro.addEventListener('mouseleave', () => { isDown = false; sliderFiltro.style.cursor = 'grab'; }); sliderFiltro.addEventListener('mouseup', () => { isDown = false; sliderFiltro.style.cursor = 'grab'; setTimeout(() => window.isDraggingFiltro = false, 50); }); sliderFiltro.addEventListener('mousemove', (e) => { if (!isDown) return; const x = e.pageX - sliderFiltro.offsetLeft, walk = (x - startX) * 1.5; if (Math.abs(walk) > 10) window.isDraggingFiltro = true; if (window.isDraggingFiltro) { e.preventDefault(); sliderFiltro.scrollLeft = scrollLeft - walk; } }); }
};

function calcular() {
    var idsSave = ['margemSlider', 'margemInput', 'taxaMeli', 'fixaMeli', 'qtdPecasProjeto', 'desp_qtd', 'desp_valor', 'toggle_urgente']; idsSave.forEach(function(id) { var el = document.getElementById(id); if (el && el.dataset && el.dataset.save) { localStorage.setItem('3d4y_dark_' + id, el.type === 'checkbox' ? el.checked : el.value); } });
    var qtdPecas = parseInt(pegaValor('qtdPecasProjeto')) || 1; if(qtdPecas < 1) qtdPecas = 1;
    var tMulti = document.getElementById('toggle_multi_mat'), multiMatEnabled = tMulti ? tMulti.checked : false, tempoTotal = pegaValor('tempoH') * qtdPecas, pesoTotalPrincipal = pegaValor('pesoPeca') * qtdPecas;
    var dep = (pegaValor('maquina') / (pegaValor('vidaUtil') || 1)) * tempoTotal, ene = (pegaValor('consumoW') / 1000) * pegaValor('precoKwh') * tempoTotal, precoMat = pegaValor('precoFilamento'); if(precoMat === 0) precoMat = 120;
    var matTotal = (precoMat / 1000) * pesoTotalPrincipal;
    if (multiMatEnabled) { var qtdExtras = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i = 2; i <= qtdExtras + 1; i++) { var precoE = pegaValor('precoFilamento' + i); if(precoE === 0) precoE = 120; matTotal += (precoE / 1000) * (pegaValor('pesoPeca' + i) * qtdPecas); } }
    var suc = pegaValor('taxaSucesso'); if (suc <= 0) suc = 100; var custoProducao = (dep + ene + matTotal) / (suc / 100);
    var rDep = document.getElementById('r_dep'); if(rDep) rDep.textContent = formatarMoeda(dep); var rEne = document.getElementById('r_ene'); if(rEne) rEne.textContent = formatarMoeda(ene); var rMat = document.getElementById('r_mat'); if(rMat) rMat.textContent = formatarMoeda(matTotal); var rGasto = document.getElementById('r_gasto'); if(rGasto) rGasto.textContent = formatarMoeda(custoProducao);
    var mInput = pegaValor('margemInput'), lucroBrutoDesejado = custoProducao * (mInput / 100), valorComLucro = custoProducao + lucroBrutoDesejado;
    var isCart = carrinho && carrinho.length > 0, totalQtd = isCart ? carrinho.reduce((a,b)=>a+parseLocal(b.qtd), 0) : (parseInt(pegaValor('qtdPecasProjeto')) || 1); if(totalQtd < 1) totalQtd = 1;
    var cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); var frete = pegaValor('valorFreteManual'); var divResumoLog = document.getElementById('resumo_logistica');
    if (divResumoLog) { divResumoLog.style.display = 'block'; var rLogFixo = document.getElementById('r_log_fixo'); if(rLogFixo) rLogFixo.textContent = formatarMoeda(cLog); var rLogFrete = document.getElementById('r_log_frete'); if(rLogFrete) rLogFrete.textContent = formatarMoeda(frete); var rGastoTotal = document.getElementById('r_gasto_total'); if(rGastoTotal) rGastoTotal.textContent = formatarMoeda((isCart ? carrinho.reduce((a,b)=>a+parseLocal(b.custo), 0) : custoProducao) + cLog + frete); }
    var vd = 0, custoProducaoTotal = 0, totS = 0, totM = 0;
    if (isCart) { 
        var totCartCusto = carrinho.reduce((a,b)=>a+parseLocal(b.custo), 0), totValorComLucro = carrinho.reduce((a,b)=>a+parseLocal(b.valorComLucro), 0); custoProducaoTotal = totCartCusto; var totBaseForRatio = totValorComLucro === 0 ? 1 : totValorComLucro;
        carrinho.forEach(i => { var iQtd = parseLocal(i.qtd || 1), iPrecoExato = parseLocal(i.precoVendaExato || 0), iValLucro = parseLocal(i.valorComLucro || 0); if (iPrecoExato > 0) { totS += iPrecoExato; totM += iPrecoExato; vd += iPrecoExato; } else { var itemRatio = iValLucro / totBaseForRatio, itemBaseTotal = iValLucro + (cLog * itemRatio), itemBaseUnit = itemBaseTotal / iQtd; var p1 = (itemBaseUnit + 4) / 0.80, p2 = (itemBaseUnit + 16) / 0.86, p3 = (itemBaseUnit + 20) / 0.86, p4 = (itemBaseUnit + 26) / 0.86, bestPShp; if (p1 <= 79.991) bestPShp = p1; else if (p2 <= 99.991) bestPShp = p2; else if (p3 <= 199.991) bestPShp = p3; else bestPShp = p4; totS += (Math.round(bestPShp * 100) / 100) * iQtd; var txMl = pegaValor('taxaMeli')/100, pAvgML_noFix = itemBaseUnit / (1 - txMl); var bestPMeli = (pAvgML_noFix >= 79.99) ? pAvgML_noFix : (itemBaseUnit + pegaValor('fixaMeli')) / (1 - txMl); totM += (Math.round(bestPMeli * 100) / 100) * iQtd; vd += itemBaseTotal; } }); vd += frete;
    } else { 
        custoProducaoTotal = custoProducao; vd = valorComLucro + cLog + frete; var vShopeeBase = valorComLucro + cLog; var avgBase = vShopeeBase / totalQtd; var p1 = (avgBase + 4) / 0.80, p2 = (avgBase + 16) / 0.86, p3 = (avgBase + 20) / 0.86, p4 = (avgBase + 26) / 0.86, bestPAvg; if (p1 <= 79.991) bestPAvg = p1; else if (p2 <= 99.991) bestPAvg = p2; else if (p3 <= 199.991) bestPAvg = p3; else bestPAvg = p4; totS = (Math.round(bestPAvg * 100) / 100) * totalQtd; var txMl = pegaValor('taxaMeli')/100, pAvgML_noFix = avgBase / (1 - txMl); var pAvgML = (pAvgML_noFix >= 79.99) ? pAvgML_noFix : (avgBase + pegaValor('fixaMeli')) / (1 - txMl); totM = (Math.round(pAvgML * 100) / 100) * totalQtd;
    }
    var elCanalSel = document.getElementById('canalVendaSelecionado'); if (elCanalSel && elCanalSel.value === 'Personalizado') { var vP = pegaValor('valorPersonalizado'); if (vP > 0) { var cDest = document.getElementById('canalPersonalizadoDestino') ? document.getElementById('canalPersonalizadoDestino').value : 'Direta'; if (cDest === "Shopee") totS = vP; else if (cDest === "Meli") totM = vP; else vd = vP; } }
    var rVendaD = document.getElementById('r_vendaD'); if(rVendaD) rVendaD.textContent = formatarMoeda(vd); var rVendaS = document.getElementById('r_vendaS'); if(rVendaS) rVendaS.textContent = formatarMoeda(totS); var rVendaM = document.getElementById('r_vendaM'); if(rVendaM) rVendaM.textContent = formatarMoeda(totM);
    var lucroD = vd - custoProducaoTotal - cLog - frete; var netS = descontarTaxas(totS, totalQtd, isCart ? carrinho : null).shopee; var lucroS = netS - custoProducaoTotal - cLog; var netM = descontarTaxas(totM, totalQtd, isCart ? carrinho : null).meli; var lucroM = netM - custoProducaoTotal - cLog;
    var tagD = document.getElementById('tag_lucroD'); if(tagD) tagD.textContent = "Lucro: R$ " + formatarMoeda(lucroD); var tagS = document.getElementById('tag_lucroS'); if(tagS) tagS.textContent = "Lucro: R$ " + formatarMoeda(lucroS); var tagM = document.getElementById('tag_lucroM'); if(tagM) tagM.textContent = "Lucro: R$ " + formatarMoeda(lucroM);
}

function salvarHistorico() {
    var cliNome = pegaTexto('nomeCliente') || "", cliTel = pegaTexto('telefoneCliente') || "", elCanal = document.getElementById('canalVendaSelecionado'), originalCanal = elCanal ? elCanal.value : "Direta", canal = originalCanal, isUrgente = document.getElementById('toggle_urgente').checked;
    var cbLiq = document.getElementById('isLiquidoExato'), isLiquidoExato = (cbLiq && cbLiq.checked && originalCanal === 'Personalizado');
    var dataInputForm = pegaTexto('dataProjeto') || new Date().toLocaleDateString('pt-BR'), idPedForm = pegaTexto('idPedidoMarketplace') || "", obsVendaForm = pegaTexto('obsVenda') || "", prazoDiasForm = pegaTexto('prazoDias') || "";
    var isCart = carrinho && carrinho.length > 0, nomeFinal = "", valorBruto = 0, custoProducaoFinal = 0, pesoFinal = 0, tempoFinal = 0, materiaisArray = [], cLog = 0, freteCalculado = 0, totalQtd = 1, valorCalculadoBruto = 0;
    if(isCart) {
        nomeFinal = carrinho.map(i => i.nome).join(' + '); custoProducaoFinal = carrinho.reduce((a,b) => a + parseLocal(b.custo), 0); pesoFinal = carrinho.reduce((a,b) => a + parseLocal(b.peso), 0); tempoFinal = carrinho.reduce((a,b) => a + parseLocal(b.tempo), 0); totalQtd = carrinho.reduce((a,b) => a + parseLocal(b.qtd), 0); if(totalQtd < 1) totalQtd = 1;
        carrinho.forEach(i => { if(i.materiais && i.materiais !== "Não informado") materiaisArray.push(i.materiais); });
        var cShopee = parseLocal(document.getElementById('cart_tot_vs').textContent), cMeli = parseLocal(document.getElementById('cart_tot_vm').textContent), cDireta = parseLocal(document.getElementById('cart_tot_vd').textContent);
        if (canal === "Personalizado") { valorBruto = pegaValor('valorPersonalizado'); canal = document.getElementById('canalPersonalizadoDestino').value; valorCalculadoBruto = (canal === "Shopee") ? cShopee : (canal === "Meli" ? cMeli : cDireta); } else if(canal === "Direta") { valorBruto = cDireta; valorCalculadoBruto = cDireta; } else if(canal === "Shopee") { valorBruto = cShopee; valorCalculadoBruto = cShopee; } else { valorBruto = cMeli; valorCalculadoBruto = cMeli; }
        cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); freteCalculado = pegaValor('valorFreteManual');
    } else {
        var nomeBase = pegaTexto('nomeProjeto') || "Sem Nome", qtdPecas = parseInt(pegaValor('qtdPecasProjeto')) || 1; if(qtdPecas < 1) qtdPecas = 1; totalQtd = qtdPecas; nomeFinal = qtdPecas > 1 ? qtdPecas + "x " + nomeBase : nomeBase; custoProducaoFinal = parseLocal(document.getElementById('r_gasto').textContent); tempoFinal = pegaValor('tempoH') * qtdPecas; pesoFinal = pegaValor('pesoPeca') * qtdPecas;
        var multiOn = document.getElementById('toggle_multi_mat').checked; if(multiOn) { var qtdEx = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i=2; i<=qtdEx+1; i++) { pesoFinal += (pegaValor('pesoPeca'+i) * qtdPecas); } }
        cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); freteCalculado = pegaValor('valorFreteManual');
        var t1 = pegaTexto('tipoFilamento1'), c1 = pegaTexto('corFilamento1'), m1 = pegaTexto('marcaFilamento1'), p1 = pegaValor('pesoPeca') * qtdPecas, nomeMat1 = (t1 + ' ' + c1 + ' ' + m1).trim(); if (nomeMat1 === '') nomeMat1 = 'Filamento 1'; if(p1 > 0) { materiaisArray.push(nomeMat1 + ' (' + p1 + 'g)'); }
        if (multiOn) { var qCores = document.getElementById('qtdCoresExtras'), qtdExtras = qCores ? (parseInt(pegaValor('qtdCoresExtras')) || 1) : 1; for(var i = 2; i <= qtdExtras + 1; i++) { var ti = pegaTexto('tipoFilamento'+i), ci = pegaTexto('corFilamento'+i), mi = pegaTexto('marcaFilamento'+i), pi = pegaValor('pesoPeca'+i) * qtdPecas, nomeMatI = (ti + ' ' + ci + ' ' + mi).trim(); if (nomeMatI === '') nomeMatI = 'Filamento ' + i; if(pi > 0) { materiaisArray.push(nomeMatI + ' (' + pi + 'g)'); } } }
        var rS = parseLocal(document.getElementById('r_vendaS').textContent), rM = parseLocal(document.getElementById('r_vendaM').textContent), rD = parseLocal(document.getElementById('r_vendaD').textContent);
        if (canal === "Personalizado") { valorBruto = pegaValor('valorPersonalizado'); canal = document.getElementById('canalPersonalizadoDestino').value; valorCalculadoBruto = (canal === "Shopee") ? rS : (canal === "Meli" ? rM : rD); } else if(canal === "Direta") { valorBruto = rD; valorCalculadoBruto = rD; } else if(canal === "Shopee") { valorBruto = rS; valorCalculadoBruto = rS; } else { valorBruto = rM; valorCalculadoBruto = rM; }
    }
    var oldItem = null; if (editHistoricoId) { oldItem = historico.find(h => h.id === editHistoricoId); }
    var freteFinal = (canal === "Shopee" || canal === "Meli") ? 0 : freteCalculado, net = descontarTaxas(valorBruto, totalQtd, isCart ? carrinho : (oldItem ? oldItem.cartItems : null)), valorVendaFinal = 0;
    if (isLiquidoExato) { valorVendaFinal = valorBruto; var fallbackBruto = oldItem ? (oldItem.valorBruto !== undefined ? oldItem.valorBruto : (oldItem.valorLiquido !== undefined ? oldItem.valorLiquido : (oldItem.valorVenda !== undefined ? oldItem.valorVenda : oldItem.pix))) : valorCalculadoBruto; valorBruto = fallbackBruto || valorCalculadoBruto || 0; } else { if(canal === "Shopee") { valorVendaFinal = net.shopee; } else if(canal === "Meli") { valorVendaFinal = net.meli; } else { valorVendaFinal = valorBruto; } }
    if(valorVendaFinal < 0) valorVendaFinal = 0;
    var stringMateriais = materiaisArray.length > 0 ? materiaisArray.join(' + ') : 'Não informado', multiOnSave = document.getElementById('toggle_multi_mat').checked, extrasArrSave = [];
    if(multiOnSave) { var qtdExSave = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i=2; i<=qtdExSave+1; i++) { extrasArrSave.push({ tipo: pegaTexto('tipoFilamento'+i), cor: pegaTexto('corFilamento'+i), marca: pegaTexto('marcaFilamento'+i), preco: pegaTexto('precoFilamento'+i), peso: pegaTexto('pesoPeca'+i) }); } }
    var cartToSave = []; if(isCart) { cartToSave = JSON.parse(JSON.stringify(carrinho)); } else { cartToSave.push({ id: Date.now(), nome: nomeFinal, qtd: totalQtd, custo: custoProducaoFinal, valorComLucro: valorVendaFinal, peso: pesoFinal, tempo: tempoFinal, materiais: stringMateriais, tipo1: pegaTexto('tipoFilamento1'), cor1: pegaTexto('corFilamento1'), marca1: pegaTexto('marcaFilamento1'), multi: multiOnSave, qtdCores: pegaTexto('qtdCoresExtras'), extras: extrasArrSave }); }
    var isPrazoChanged = oldItem ? (oldItem.prazoDias !== prazoDiasForm || !!oldItem.urgente !== !!isUrgente) : true;
    var pManual = (oldItem && !isPrazoChanged) ? oldItem.posicaoFilaManual : undefined;
    var urlFotoSalvar = isCart ? (carrinho.length > 0 ? carrinho[0].foto : '') : pegaTexto('fotoUrlProjeto');

    var novo = { id: editHistoricoId ? editHistoricoId : Date.now(), timestampCriacao: oldItem ? (oldItem.timestampCriacao || oldItem.id) : Date.now(), idPedido: idPedForm, nome: nomeFinal || "", cliente: cliNome || "", telefone: cliTel || "", canal: canal || "Direta", materiais: stringMateriais || "Não informado", valorVenda: valorVendaFinal || 0, valorBruto: valorBruto || 0, valorLiquido: valorVendaFinal || 0, custo: custoProducaoFinal || 0, frete: freteFinal || 0, logistica: cLog || 0, peso: pesoFinal || 0, tempo: tempoFinal || 0, cartItems: cartToSave || [], totalQtd: totalQtd || 1, urgente: !!isUrgente, status: oldItem ? (oldItem.status || "Orçamento") : "Orçamento", data: dataInputForm, foto: urlFotoSalvar || "", obsVenda: obsVendaForm, prazoDias: prazoDiasForm, posicaoFilaManual: pManual, estoqueBaixado: oldItem ? !!oldItem.estoqueBaixado : false, vendaIsolada: editHistoricoId ? true : (oldItem ? !!oldItem.vendaIsolada : false) };
    salvarNoFirebase('historico', novo);
    
    if (editHistoricoId) { editHistoricoId = null; document.getElementById('btn_salvar_venda_main').textContent = "💾 Salvar Venda"; document.getElementById('btn_salvar_venda_main').style.background = "var(--purple)"; var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "none"; }
    if (cliNome.trim() !== '') { if (!clientesCadastrados[cliNome] && cliTel) { clientesCadastrados[cliNome] = cliTel; var dl = document.getElementById('listaClientes'); if (dl) { dl.innerHTML += `<option value="${cliNome}">`; } } }
    var elPerso = document.getElementById('valorPersonalizado'); if(elPerso) elPerso.value = ''; localStorage.removeItem('3d4y_dark_valorPersonalizado'); resetarDados(); showToast("✅ Venda Registrada!");
}

function editarItemHistorico(id) {
    var item = historico.find(h => h.id === id); if (!item) return;
    carrinho = []; document.getElementById('carrinho_container').style.display = 'none';
    var prod; if (item.cartItems && item.cartItems.length === 1) { prod = item.cartItems[0]; } else if (item.cartItems && item.cartItems.length > 1) { carrinho = JSON.parse(JSON.stringify(item.cartItems)); renderCarrinho(); document.getElementById('qtdPecasProjeto').value = "1"; document.getElementById('nomeProjeto').value = ""; document.getElementById('tempoH').value = ""; document.getElementById('pesoPeca').value = ""; } else { var matchOld = item.nome.match(/^(\d+)x\s(.*)/), qtdOld = matchOld ? parseInt(matchOld[1]) : (item.totalQtd || 1); prod = { nome: item.nome, qtd: qtdOld, tempo: item.tempo, peso: item.peso }; }
    if (prod) { var match = prod.nome.match(/^(\d+)x\s(.*)/), qtd = match ? parseInt(match[1]) : (prod.qtd || item.totalQtd || 1), baseNome = match ? match[2] : prod.nome; document.getElementById('nomeProjeto').value = baseNome; document.getElementById('qtdPecasProjeto').value = qtd; document.getElementById('tempoH').value = formatarMoeda((prod.tempo || item.tempo) / qtd); document.getElementById('pesoPeca').value = formatarMoeda((prod.peso || item.peso) / qtd); var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === baseNome.toLowerCase().trim()), selCat = document.getElementById('sel_catalogo'); if(matchCat) { if(selCat) selCat.value = matchCat.id.toString(); } else { if(selCat) selCat.value = ""; } document.getElementById('tipoFilamento1').value = prod.tipo1 || ""; document.getElementById('corFilamento1').value = prod.cor1 || ""; document.getElementById('marcaFilamento1').value = prod.marca1 || ""; var match1 = null; if(prod.tipo1) { match1 = estoque.find(e => e.tipo === prod.tipo1 && e.cor === prod.cor1 && e.marca === prod.marca1) || estoque.find(e => e.tipo === prod.tipo1 && e.cor === prod.cor1); } var sel1 = document.getElementById('sel_est_1'); if(match1) { if(sel1) sel1.value = match1.id.toString(); document.getElementById('marcaFilamento1').value = match1.marca; document.getElementById('precoFilamento').value = match1.preco; } else { if(sel1) sel1.value = ""; } document.getElementById('detalhes_1').style.display = (prod.tipo1) ? 'block' : 'none'; limparFantasmasMultiCor(); var tMulti = document.getElementById('toggle_multi_mat'); if(tMulti) { tMulti.checked = prod.multi || false; tMulti.dispatchEvent(new Event('change')); } if(prod.multi && prod.extras) { document.getElementById('qtdCoresExtras').value = prod.qtdCores || "1"; prod.extras.forEach((ex, idx) => { var i = idx + 2; salvarDinamicoValor('tipoFilamento'+i, ex.tipo || ""); salvarDinamicoValor('corFilamento'+i, ex.cor || ""); salvarDinamicoValor('marcaFilamento'+i, ex.marca || ""); salvarDinamicoValor('precoFilamento'+i, ex.preco || ""); salvarDinamicoValor('pesoPeca'+i, ex.peso || ""); }); renderCoresExtras(); prod.extras.forEach((ex, idx) => { var i = idx + 2; setTimeout(() => { var matchI = null; if(ex.tipo) { matchI = estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor && e.marca === ex.marca) || estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor); } var selI = document.getElementById('sel_est_'+i); if(matchI) { if(selI) selI.value = matchI.id.toString(); document.getElementById('precoFilamento'+i).value = matchI.preco; document.getElementById('marcaFilamento'+i).value = matchI.marca; } else { if(selI) selI.value = ""; document.getElementById('precoFilamento'+i).value = ex.preco || "120,00"; document.getElementById('marcaFilamento'+i).value = ex.marca || ""; } }, 50); }); } salvarDinamico('nomeProjeto'); salvarDinamico('qtdPecasProjeto'); salvarDinamico('tempoH'); salvarDinamico('pesoPeca'); }
    if (item.foto) { document.getElementById('fotoUrlProjeto').value = item.foto; salvarDinamico('fotoUrlProjeto'); var preview = document.getElementById('previewFotoMain'); if(preview) { preview.style.backgroundImage = `url('${item.foto}')`; preview.style.display = "block"; } } else { document.getElementById('fotoUrlProjeto').value = ""; var p = document.getElementById('previewFotoMain'); if(p) p.style.display = "none"; }
    document.getElementById('nomeCliente').value = item.cliente || ""; document.getElementById('telefoneCliente').value = item.telefone || ""; var elDataP = document.getElementById('dataProjeto'); if (elDataP) { elDataP.value = item.data || new Date().toLocaleDateString('pt-BR'); salvarDinamico('dataProjeto'); } var elIdPed = document.getElementById('idPedidoMarketplace'); if(elIdPed) { elIdPed.value = item.idPedido || ""; salvarDinamico('idPedidoMarketplace'); } var elObs = document.getElementById('obsVenda'); if(elObs) { elObs.value = item.obsVenda || ""; salvarDinamico('obsVenda'); } var elPrazo = document.getElementById('prazoDias'); if(elPrazo) { elPrazo.value = item.prazoDias || ""; salvarDinamico('prazoDias'); }
    var tUrgente = document.getElementById('toggle_urgente'); if (tUrgente) { tUrgente.checked = !!item.urgente; tUrgente.dispatchEvent(new Event('change')); }
    var elCanal = document.getElementById('canalVendaSelecionado'), elDest = document.getElementById('canalPersonalizadoDestino'), elPerso = document.getElementById('valorPersonalizado');
    if (item.valorBruto !== undefined && item.valorBruto > 0) { elCanal.value = "Personalizado"; if(elDest) elDest.value = item.canal || "Direta"; elPerso.value = formatarMoeda(item.valorBruto); salvarDinamico('valorPersonalizado'); } else { var canalReal = item.canal === "Direta" || item.canal === "Shopee" || item.canal === "Meli" ? item.canal : "Personalizado"; if (canalReal === "Personalizado") { elCanal.value = "Personalizado"; if(elDest) elDest.value = item.canal || "Direta"; elPerso.value = formatarMoeda(item.valorLiquido || item.valorVenda); salvarDinamico('valorPersonalizado'); } else { elCanal.value = canalReal; elPerso.value = ""; localStorage.removeItem('3d4y_dark_valorPersonalizado'); } }
    mostrarValorPersonalizado(); var cbLiq = document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked = false; 
    if (item.logistica > 0 || item.frete > 0) { var qtd = item.totalQtd || 1; document.getElementById('custoEmbalagem').value = formatarMoeda((item.logistica || 0) / qtd); document.getElementById('custoDeslocamento').value = "0,00"; var vFrete = document.getElementById('valorFreteManual'); if(vFrete) vFrete.value = formatarMoeda(item.frete || 0); }
    calcular(); editHistoricoId = id; document.getElementById('btn_salvar_venda_main').textContent = "💾 Confirmar Edição de Venda"; document.getElementById('btn_salvar_venda_main').style.background = "var(--sky)"; var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "block"; showToast("✏️ Venda carregada para edição!"); var dash = document.querySelector('.dashboard'); if(dash) dash.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mudarStatus(id, novoStatus) { 
    setTimeout(function() {
        var index = historico.findIndex(h => h.id === id); 
        if (index > -1) { 
            var h = historico[index];
            h.status = novoStatus; 
            if ((novoStatus === 'Finalizado' || novoStatus === 'Enviado / Entregue') && !h.estoqueBaixado) {
                if (confirm("Deseja dar baixa dos materiais gastos nesta peça (" + formatarMoeda(h.peso) + "g) no Estoque?")) { window.darBaixaEstoqueVenda(h); h.estoqueBaixado = true; }
            }
            salvarNoFirebase('historico', h);
        } 
    }, 200); 
}

window.registrarFalha = function(id) {
    var h = historico.find(x => x.id === id); if (!h) return;
    var pesoPerdidoStr = prompt(`🚨 Registrar Refugo / Perda para: ${h.nome}\n\nQuantas gramas de filamento foram perdidas?`, formatarMoeda(h.peso));
    if (pesoPerdidoStr) {
        var pesoPerdido = parseLocal(pesoPerdidoStr);
        if (pesoPerdido > 0) {
            var custoPorGrama = h.peso > 0 ? (h.custo / h.peso) : (120/1000);
            var custoPrejuizo = custoPorGrama * pesoPerdido;
            var novaDespesa = { id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), qtd: 1, nome: "⚠️ Refugo de Material: " + h.nome, valor: custoPrejuizo };
            salvarNoFirebase('despesas', novaDespesa);
            var t1 = h.tipo1, c1 = h.cor1, m1 = h.marca1;
            if (t1) { let itemEstoque = estoque.find(e => e.tipo === t1 && e.cor === c1 && e.marca === m1) || estoque.find(e => e.tipo === t1 && e.cor === c1); if (itemEstoque) { itemEstoque.pesoAtual = (itemEstoque.pesoAtual || 1000) - pesoPerdido; if(itemEstoque.pesoAtual < 0) itemEstoque.pesoAtual = 0; salvarNoFirebase('estoque', itemEstoque); } }
            showToast("🗑️ Refugo registado nas despesas e estoque!");
        }
    }
};

window.darBaixaEstoqueVenda = function(h) {
    if (h.materiais && h.materiais !== "Não informado") {
        let mats = h.materiais.split(' + ');
        mats.forEach(m => {
            let match = m.match(/(.+?)\s+\(([\d.,]+)g\)/);
            if (match) {
                let nomeMat = match[1].trim(); let pesoGasto = parseLocal(match[2]);
                let itemEstoque = estoque.find(e => { let n = (e.tipo + " " + e.cor + " " + (e.marca || "")).trim(); let nCurto = (e.tipo + " " + e.cor).trim(); return n === nomeMat || nCurto === nomeMat; });
                if (itemEstoque) { itemEstoque.pesoAtual = (itemEstoque.pesoAtual || 1000) - pesoGasto; if (itemEstoque.pesoAtual < 0) itemEstoque.pesoAtual = 0; salvarNoFirebase('estoque', itemEstoque); }
            }
        });
        showToast("📉 Materiais descontados do estoque!");
    }
};

function renderHistorico() {
    var lista = document.getElementById('listaHistorico'); if(!lista) return; var filtroDiv = document.getElementById('filtroHistorico');
    var somaCusto = 0, somaBruto = 0, somaLiquido = 0, somaLucro = 0, somaLogistica = 0, somaDireta = 0, somaShopee = 0, somaMeli = 0, qtdDireta = 0, qtdShopee = 0, qtdMeli = 0, qtdValida = 0, totDevolvido = 0;
    var counts = { 'Todos': 0, 'Orçamento': 0, 'Na Fila': 0, 'Imprimindo': 0, 'Finalizado': 0, 'Enviado / Entregue': 0, 'Devolução': 0 }; window.horasTotaisImpressasGlobal = 0;
    var campoBusca = document.getElementById('buscaCliente'), termoBusca = campoBusca ? campoBusca.value.toLowerCase().trim() : '';
    var historicoFiltradoDias = historico.filter(h => isWithinDays(h.data || new Date().toLocaleDateString('pt-BR'), window.filtroDiasAtual));
    
    var itensFiltrados = historicoFiltradoDias.filter(function(item) { 
        var st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue'; 
        var passaStatus = window.filtroStatusAtual === 'Todos' || st === window.filtroStatusAtual; 
        var passaBusca = true; 
        if (termoBusca !== '') { var nomeC = (item.cliente || '').toLowerCase(), nomeP = (item.nome || '').toLowerCase(), idP = (item.idPedido || '').toLowerCase(), sysId = (item.id || '').toString().toLowerCase(); if (!nomeC.includes(termoBusca) && !nomeP.includes(termoBusca) && !idP.includes(termoBusca) && !sysId.includes(termoBusca)) { passaBusca = false; } } 
        return passaStatus && passaBusca; 
    });
    
    counts['Todos'] = 0; 
    historicoFiltradoDias.forEach(function(item) {
        var st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue'; 
        var matchBusca = true;
        if (termoBusca !== '') { var nC = (item.cliente || '').toLowerCase(), nP = (item.nome || '').toLowerCase(), iPd = (item.idPedido || '').toLowerCase(), sId = (item.id || '').toString().toLowerCase(); if (!nC.includes(termoBusca) && !nP.includes(termoBusca) && !iPd.includes(termoBusca) && !sId.includes(termoBusca)) matchBusca = false; }
        if(matchBusca) { counts[st] = (counts[st] || 0) + 1; counts['Todos']++; }
        if (st !== 'Orçamento' && st !== 'Devolução' && matchBusca) {
            var custoItem = parseLocal(item.custo), freteLogItem = parseLocal(item.frete || 0) + parseLocal(item.logistica || 0), canalStr = item.canal || "Direta", valLiq = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)), valBruto = item.valorBruto !== undefined ? parseLocal(item.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem;
            somaCusto += custoItem; somaLogistica += freteLogItem; somaBruto += valBruto; somaLiquido += valLiq; somaLucro += lucroItem; qtdValida++;
            if(canalStr === "Shopee") { somaShopee += valLiq; qtdShopee++; } else if(canalStr === "Meli") { somaMeli += valLiq; qtdMeli++; } else { somaDireta += valLiq; qtdDireta++; }
        }
        if (st === 'Devolução' && matchBusca) { var valLiqDev = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)); totDevolvido += valLiqDev; }
        if ((st === 'Imprimindo' || st === 'Finalizado' || st === 'Enviado / Entregue') && matchBusca) { window.horasTotaisImpressasGlobal += parseLocal(item.tempo); }
    });

    var lblOdometro = document.getElementById('lbl_horas_totais_maquina'); if (lblOdometro) lblOdometro.textContent = formatarMoeda(window.horasTotaisImpressasGlobal) + "h";
    var txtVida = document.getElementById('txt_vida_util'), barVida = document.getElementById('bar_vida_util'), msgVida = document.getElementById('msg_vida_util'), qaAviso = pegaValor('qa_aviso'); if (qaAviso <= 0 || isNaN(qaAviso)) qaAviso = 100;
    var offset = parseFloat(window.qaOffset) || 0, hrsAtuais = window.horasTotaisImpressasGlobal - offset; if (hrsAtuais < 0 || isNaN(hrsAtuais)) hrsAtuais = 0;
    var pctQA = (hrsAtuais / qaAviso) * 100; if (isNaN(pctQA) || pctQA < 0) pctQA = 0; if(pctQA > 100) pctQA = 100;
    if (txtVida && barVida && msgVida) { txtVida.textContent = formatarMoeda(hrsAtuais) + "h / " + qaAviso + "h"; barVida.style.width = pctQA + "%"; if (pctQA < 50) { msgVida.textContent = "🟢 Saudável. A máquina está 100% livre!"; barVida.style.background = "var(--success)"; } else if (pctQA < 85) { msgVida.textContent = "🟡 Requer Atenção: Agende uma manutenção/lubrificação em breve."; barVida.style.background = "#facc15"; } else { msgVida.textContent = "🔴 CUIDADO: Risco iminente de quebra ou perda de qualidade."; barVida.style.background = "var(--danger)"; } }
    if (filtroDiv) { filtroDiv.innerHTML = `<button class="filter-btn ${window.filtroStatusAtual === 'Todos' ? 'active' : ''}" onclick="mudarFiltro('Todos')">📋 Todos (${counts['Todos']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Orçamento' ? 'active' : ''}" onclick="mudarFiltro('Orçamento')">🟡 Orç. (${counts['Orçamento']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Na Fila' ? 'active' : ''}" onclick="mudarFiltro('Na Fila')">🔵 Fila (${counts['Na Fila']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Imprimindo' ? 'active' : ''}" onclick="mudarFiltro('Imprimindo')">🟣 Impr. (${counts['Imprimindo']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Finalizado' ? 'active' : ''}" onclick="mudarFiltro('Finalizado')">🟢 Fin. (${counts['Finalizado']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Enviado / Entregue' ? 'active' : ''}" onclick="mudarFiltro('Enviado / Entregue')">🚚 Env. (${counts['Enviado / Entregue']})</button><button class="filter-btn ${window.filtroStatusAtual === 'Devolução' ? 'active' : ''}" onclick="mudarFiltro('Devolução')">❌ Devol. (${counts['Devolução']})</button> <select onchange="window.mudarFiltroDias(this.value)" style="margin-left:10px; padding:6px; border-radius:6px; background:#1e293b; color:var(--sky); border:1px solid var(--border); font-weight:bold; cursor:pointer; outline:none;"><option value="Total" ${window.filtroDiasAtual === 'Total' ? 'selected' : ''}>📅 Período: Total</option><option value="30" ${window.filtroDiasAtual === '30' ? 'selected' : ''}>📅 Últimos 30 Dias</option><option value="60" ${window.filtroDiasAtual === '60' ? 'selected' : ''}>📅 Últimos 60 Dias</option><option value="90" ${window.filtroDiasAtual === '90' ? 'selected' : ''}>📅 Últimos 90 Dias</option></select>`; }

    var isFila = window.filtroStatusAtual === 'Na Fila'; 
    if (isFila) { itensFiltrados.sort((a, b) => { var valA = a.posicaoFilaManual || window.getDeadlineMs(a); var valB = b.posicaoFilaManual || window.getDeadlineMs(b); return valA - valB; }); }
    
    if (itensFiltrados.length === 0) { lista.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.7rem; margin-top:10px;">Nenhum pedido encontrado no período</p>'; } else {
        var htmlFinal = "";
        itensFiltrados.forEach(function(item, index) {
            var custoItem = parseLocal(item.custo), freteLogItem = parseLocal(item.frete || 0) + parseLocal(item.logistica || 0), canalStr = item.canal || "Direta", valLiq = item.valorLiquido !== undefined ? parseLocal(item.valorLiquido) : (item.valorVenda !== undefined ? parseLocal(item.valorVenda) : parseLocal(item.pix)), valBruto = item.valorBruto !== undefined ? parseLocal(item.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem, tagCanal = canalStr === "Direta" ? "PIX" : canalStr === "Shopee" ? "SHP" : "ML", corTag = canalStr === "Shopee" ? "#f94d30" : canalStr === "Meli" ? "#facc15" : "#10b981", corTextoTag = canalStr === "Meli" ? "#000" : "#fff", st = item.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue';
            var colorClass = st === 'Orçamento' ? 'status-orcamento' : st === 'Na Fila' ? 'status-fila' : st === 'Imprimindo' ? 'status-imprimindo' : st === 'Enviado / Entregue' ? 'status-enviado' : st === 'Devolução' ? 'status-devolucao' : 'status-finalizado';
            var txtVenda = (valBruto !== valLiq) ? `Líq: R$ ${formatarMoeda(valLiq)} <span style="font-size:0.55rem; color:var(--text-muted); font-weight:normal;">(Bruto: R$ ${formatarMoeda(valBruto)})</span>` : `R$ ${formatarMoeda(valLiq)}`;
            var prefixoFila = isFila ? `<span style="color: var(--sky); font-weight: 900; margin-right: 5px;">[${index + 1}º]</span> ` : '', bordaUrgente = item.urgente ? 'border: 2px solid var(--danger);' : 'border: 1px solid var(--border);'; if(st === 'Devolução') bordaUrgente = 'border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.05); opacity: 0.8;';
            var tagUrgente = item.urgente ? `<span style="font-size:0.55rem; color:#fff; background:var(--danger); padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:bold;">🔥 URGENTE</span>` : '';
            var checkEstoque = item.estoqueBaixado ? `<span style="font-size:0.55rem; color:#10b981; margin-left:5px;" title="Estoque Descontado">📉 OK</span>` : '';
            var lockIcon = item.vendaIsolada ? `<span style="font-size:0.65rem; margin-left:5px;" title="Venda Protegida: Alterações no catálogo não afetam este pedido">🔒</span>` : '';
            var htmlFoto = '';
            if (item.cartItems && item.cartItems.length > 1) { var fotosValidas = item.cartItems.map(i => i.foto).filter(f => f && f.trim() !== ''); if (fotosValidas.length > 0) { var gridCols = fotosValidas.length > 1 ? '1fr 1fr' : '1fr'; var gridRows = fotosValidas.length > 2 ? '1fr 1fr' : '1fr'; htmlFoto = `<div style="width:40px; height:40px; border-radius:6px; margin-right:8px; flex-shrink:0; display:grid; grid-template-columns:${gridCols}; grid-template-rows:${gridRows}; gap:2px; overflow:hidden; border:1px solid var(--border);">`; fotosValidas.slice(0, 4).forEach(f => { htmlFoto += `<div style="background-image:url('${f}'); background-size:cover; background-position:center; width:100%; height:100%;"></div>`; }); htmlFoto += `</div>`; } }
            if (!htmlFoto) { var fotoParaMostrar = item.foto; if (!fotoParaMostrar) { var nomeParaBusca = (item.nome || "").toLowerCase().trim(); var matchQtd = nomeParaBusca.match(/^\d+x\s(.*)/); if(matchQtd) nomeParaBusca = matchQtd[1]; var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === nomeParaBusca); if (matchCat && matchCat.foto) fotoParaMostrar = matchCat.foto; } htmlFoto = fotoParaMostrar ? `<div style="width:40px; height:40px; border-radius:6px; background-image:url('${fotoParaMostrar}'); background-size:cover; background-position:center; margin-right:8px; border:1px solid var(--border); flex-shrink:0;"></div>` : ''; }
            var titleHtml = `<h4 style="margin:0; line-height: 1.2; font-size: 0.9rem; word-wrap: break-word;">${prefixoFila}<span style="font-size:0.55rem; color:${corTextoTag}; background:${corTag}; padding:2px 4px; border-radius:4px; margin-right:4px; vertical-align: middle; display: inline-block;">${tagCanal}</span>${item.nome}${tagUrgente}${checkEstoque}${lockIcon}</h4>`;
            var crmHtml = item.cliente ? `<div style="font-size: 0.70rem; color: #00d2ff; margin-top: 4px; font-weight: 600;">👤 Cliente: ${item.cliente}</div>` : '';
            if (item.idPedido) crmHtml += `<div style="font-size: 0.70rem; color: var(--orange); margin-top: 2px; font-weight: 600;">#️⃣ ID Pedido: ${item.idPedido}</div>`;
            var countdownHtml = "";
            if (item.prazoDias && parseLocal(item.prazoDias) > 0 && (st === 'Orçamento' || st === 'Na Fila' || st === 'Imprimindo')) { var parts = (item.data || "").split('/'); if (parts.length === 3) { var baseTime = new Date(item.timestampCriacao || item.id); if (isNaN(baseTime.getTime())) baseTime = new Date(); var targetDate = new Date(parts[2], parts[1] - 1, parts[0], baseTime.getHours(), baseTime.getMinutes(), baseTime.getSeconds()); var diasRestantes = parseLocal(item.prazoDias); var diasAdicionados = 0; while (diasAdicionados < diasRestantes) { targetDate.setDate(targetDate.getDate() + 1); if (targetDate.getDay() !== 0) { diasAdicionados++; } } var diff = targetDate.getTime() - Date.now(); if (diff > 0) { var d = Math.floor(diff / (1000 * 60 * 60 * 24)); var h = Math.floor((diff / (1000 * 60 * 60)) % 24); countdownHtml = `<div style="font-size: 0.70rem; color: #fff; margin-top: 4px; font-weight: 800; background: #ef4444; padding: 4px 6px; border-radius: 6px; display: inline-block; box-shadow: 0 0 10px rgba(239,68,68,0.5);">⏳ Envio em: ${d}d e ${h}h</div>`; } else { countdownHtml = `<div style="font-size: 0.70rem; color: #fff; margin-top: 4px; font-weight: 900; background: #991b1b; padding: 4px 6px; border-radius: 6px; display: inline-block; border: 1px solid #ef4444;">🚨 ATRASADO!</div>`; } } }
            if (item.obsVenda) crmHtml += `<div style="font-size: 0.70rem; color: #ef4444; margin-top: 4px; font-weight: 800; background: rgba(239, 68, 68, 0.1); padding: 4px 6px; border-radius: 6px; border: 1px dashed rgba(239, 68, 68, 0.3);">📌 Obs: ${item.obsVenda}</div>`;
            if (countdownHtml !== "") crmHtml += `<div>${countdownHtml}</div>`;
            var btnSubir = `<button onclick="moverFila(${item.id}, -1)" style="background:var(--card-bg); border:1px solid var(--border); border-radius:4px; font-size:0.9rem; padding:3px 10px; cursor:pointer;" title="Subir na Fila">⬆️</button>`;
            var btnDescer = `<button onclick="moverFila(${item.id}, 1)" style="background:var(--card-bg); border:1px solid var(--border); border-radius:4px; font-size:0.9rem; padding:3px 10px; cursor:pointer;" title="Descer na Fila">⬇️</button>`;
            var filaBtnsHtml = isFila ? `<div style="display:flex; gap:4px;">${btnSubir}${btnDescer}</div>` : '';
            var btnFalha = `<button onclick="registrarFalha(${item.id})" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Registrar Refugo / Perda">🗑️</button>`;
            var btnEditar = `<button onclick="editarItemHistorico(${item.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button>`;
            var btnExcluir = `<button onclick="removerItem(${item.id})" style="color:#ef4444;background:none;border:none;font-size:1.3rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button>`;
            var botoesDireita = `<div style="display: flex; align-items: center; gap: 10px; margin-left: auto;">${btnFalha}${btnEditar}${btnExcluir}</div>`;
            var barraAcoes = `<div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); margin-top: 6px;"><select class="status-select ${colorClass}" style="width: 100%; margin: 0; font-size: 0.8rem; padding: 4px;" onchange="mudarStatus(${item.id}, this.value)"><option value="Orçamento" ${st==='Orçamento'?'selected':''}>🟡 Orçamento</option><option value="Na Fila" ${st==='Na Fila'?'selected':''}>🔵 Na Fila</option><option value="Imprimindo" ${st==='Imprimindo'?'selected':''}>🟣 Imprimindo</option><option value="Finalizado" ${st==='Finalizado'?'selected':''}>🟢 Finalizado</option><option value="Enviado / Entregue" ${st==='Enviado / Entregue'?'selected':''}>🚚 Enviado / Entregue</option><option value="Devolução" ${st==='Devolução'?'selected':''}>❌ Devolução</option></select><div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">${filaBtnsHtml}${botoesDireita}</div></div>`;
            htmlFinal += `<div class="history-item" style="${bordaUrgente} padding: 10px;"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 2px;">${htmlFoto}<div style="flex: 1; min-width: 0;">${titleHtml}${crmHtml}</div></div>${barraAcoes}<div class="hist-vals" style="margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 0.80rem;"><span style="grid-column: span 2;">Venda: <b style="color:#fff">${txtVenda}</b></span><span>Custo Fab: R$ ${formatarMoeda(custoItem)}</span><span>Frete/Log: R$ ${formatarMoeda(freteLogItem)}</span><span style="grid-column: span 2; color:#10b981; font-size:0.85rem;">Lucro: <b>R$ ${formatarMoeda(lucroItem)}</b></span><span style="grid-column: span 2; font-size: 0.6rem; opacity: 0.5; margin-top: 2px;">Data: ${item.data}</span></div></div>`;
        });
        lista.innerHTML = htmlFinal;
    }
    document.getElementById('tot_qtd').textContent = qtdValida; document.getElementById('tot_custo').textContent = formatarMoeda(somaCusto); document.getElementById('tot_logistica').textContent = formatarMoeda(somaLogistica); document.getElementById('tot_faturamento_bruto').textContent = formatarMoeda(somaBruto); document.getElementById('tot_faturamento').textContent = formatarMoeda(somaLiquido); document.getElementById('tot_lucro').textContent = formatarMoeda(somaLucro); var divDev = document.getElementById('tot_devolucoes'); if(divDev) divDev.textContent = formatarMoeda(totDevolvido); document.getElementById('qtd_direta').textContent = qtdDireta; document.getElementById('tot_direta').textContent = formatarMoeda(somaDireta); document.getElementById('qtd_shopee').textContent = qtdShopee; document.getElementById('tot_shopee').textContent = formatarMoeda(somaShopee); document.getElementById('qtd_meli').textContent = qtdMeli; document.getElementById('tot_meli').textContent = formatarMoeda(somaMeli); atualizarLucroReal();
}

function removerItem(id) { if(confirm("Deseja apagar este projeto do histórico?")) { apagarNoFirebase('historico', id); } }

window.forcarRecalculoGeral = function() {
    if(!confirm("⚠️ ATENÇÃO: Isto vai atualizar APENAS OS CUSTOS DE EMBALAGEM E DESLOCAMENTO de todas as vendas para refletir os valores das configurações.\n\nO Valor da Venda (Grana recebida) ficará INTACTO! Deseja continuar?")) return;
    var emb = pegaValor('custoEmbalagem'), des = pegaValor('custoDeslocamento'); var cLogGlobal = emb + des; var corrigidos = 0;
    historico.forEach(h => {
        if (h.status === 'Orçamento' || h.status === 'Devolução') return;
        h.logistica = cLogGlobal; salvarNoFirebase('historico', h); corrigidos++;
    });
    showToast("✅ " + corrigidos + " custos logísticos atualizados!"); fecharModal('configModal');
};

window.sincronizarTudoComCatalogo = function() {
    if(!confirm("⚠️ ATENÇÃO: Isso vai atualizar APENAS:\n- Tempo de Impressão\n- Peso de Filamento\n- Custo de Fabricação\n- Materiais\n\nOs valores de Venda (Grana) ficarão 100% INTACTOS. Deseja continuar?")) return;
    var nMaq = pegaValor('maquina'), nVid = pegaValor('vidaUtil'), nCon = pegaValor('consumoW'), nKwh = pegaValor('precoKwh'); var custoHoraBase = (nMaq / (nVid || 1)) + ((nCon / 1000) * nKwh); var taxaSucesso = (pegaValor('taxaSucesso') || 100) / 100; var atualizadas = 0;
    historico.forEach(h => {
        if (h.status === 'Orçamento' || h.status === 'Devolução' || h.vendaIsolada) return;
        var alterou = false;
        if (h.cartItems && h.cartItems.length > 0) {
            var novoCustoTotalCart = 0, novoPesoTotalCart = 0, novoTempoTotalCart = 0, novosMateriaisCart = [];
            h.cartItems.forEach(ci => {
                var matchNome = ci.nome.match(/^(\d+)x\s(.*)/); var baseNome = matchNome ? matchNome[2].trim().toLowerCase() : ci.nome.trim().toLowerCase(); var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === baseNome);
                if (matchCat) {
                    alterou = true; var qtd = parseLocal(ci.qtd || 1), tempoUnit = parseLocal(matchCat.tempo), pesoUnit = parseLocal(matchCat.peso1), pFil = parseLocal(matchCat.preco1) || 120; var matCost = (pFil / 1000) * pesoUnit, matArr = []; var n1 = (matchCat.tipo1 + ' ' + matchCat.cor1 + ' ' + (matchCat.marca1||'')).trim() || 'Filamento 1'; if(pesoUnit > 0) matArr.push(n1 + ' (' + formatarMoeda(pesoUnit * qtd) + 'g)');
                    if(matchCat.multi && matchCat.extras && matchCat.extras.length > 0) { matchCat.extras.forEach(ex => { var pE = parseLocal(ex.preco) || 120, pesE = parseLocal(ex.peso) || 0; matCost += (pE / 1000) * pesE; pesoUnit += pesE; var nx = (ex.tipo + ' ' + ex.cor + ' ' + (ex.marca||'')).trim() || 'Filamento Extra'; if(pesE > 0) matArr.push(nx + ' (' + formatarMoeda(pesE * qtd) + 'g)'); }); }
                    var cUnit = ((tempoUnit * custoHoraBase) + matCost) / taxaSucesso; ci.tempo = tempoUnit * qtd; ci.peso = pesoUnit * qtd; ci.custo = cUnit * qtd; ci.materiais = matArr.join(' + ');
                }
                novoCustoTotalCart += parseLocal(ci.custo); novoPesoTotalCart += parseLocal(ci.peso); novoTempoTotalCart += parseLocal(ci.tempo); if(ci.materiais && ci.materiais !== "Não informado") novosMateriaisCart.push(ci.materiais);
            });
            if (alterou) { h.custo = novoCustoTotalCart; h.peso = novoPesoTotalCart; h.tempo = novoTempoTotalCart; h.materiais = novosMateriaisCart.join(' + ') || "Não informado"; salvarNoFirebase('historico', h); atualizadas++; }
        } else {
            var matchNome = h.nome.match(/^(\d+)x\s(.*)/); var baseNome = matchNome ? matchNome[2].trim().toLowerCase() : h.nome.trim().toLowerCase(); var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === baseNome);
            if (matchCat) {
                alterou = true; var qtd = parseLocal(h.totalQtd || 1), tempoUnit = parseLocal(matchCat.tempo), pesoUnit = parseLocal(matchCat.peso1), pFil = parseLocal(matchCat.preco1) || 120; var matCost = (pFil / 1000) * pesoUnit, matArr = []; var n1 = (matchCat.tipo1 + ' ' + matchCat.cor1 + ' ' + (matchCat.marca1||'')).trim() || 'Filamento 1'; if(pesoUnit > 0) matArr.push(n1 + ' (' + formatarMoeda(pesoUnit * qtd) + 'g)');
                if(matchCat.multi && matchCat.extras && matchCat.extras.length > 0) { matchCat.extras.forEach(ex => { var pE = parseLocal(ex.preco) || 120, pesE = parseLocal(ex.peso) || 0; matCost += (pE / 1000) * pesE; pesoUnit += pesE; var nx = (ex.tipo + ' ' + ex.cor + ' ' + (ex.marca||'')).trim() || 'Filamento Extra'; if(pesE > 0) matArr.push(nx + ' (' + formatarMoeda(pesE * qtd) + 'g)'); }); }
                var cUnit = ((tempoUnit * custoHoraBase) + matCost) / taxaSucesso; h.tempo = tempoUnit * qtd; h.peso = pesoUnit * qtd; h.custo = cUnit * qtd; h.materiais = matArr.join(' + '); salvarNoFirebase('historico', h); atualizadas++;
            }
        }
    });
    if (atualizadas > 0) { showToast("✅ " + atualizadas + " Vendas Atualizadas com o Catálogo!"); } else { showToast("✅ Nenhuma diferença encontrada para atualizar.", false); }
};
