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
    var s = document.getElementById('sideMenu'), m = document.getElementById('menuOverlay');
    if(s) s.classList.add('open'); 
    if(m) m.classList.add('open'); 
};

window.fecharGaveta = function() { 
    var s = document.getElementById('sideMenu'), m = document.getElementById('menuOverlay');
    if(s) s.classList.remove('open'); 
    if(m) m.classList.remove('open'); 
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
// 3. SINCRONIZAÇÃO OTIMIZADA (BLINDADA CONTRA ERROS)
// ==========================================

function salvarNoFirebase(colecao, item) { 
    if(nuvemRef && item && item.id) { 
        // 🔥 AQUI ESTÁ O SEGREDO: Isto limpa tudo o que o Firebase não suporta (como undefined)
        var cleanItem = JSON.parse(JSON.stringify(item));
        nuvemRef.collection(colecao).doc(item.id.toString()).set(cleanItem)
        .catch(e => { console.error("Erro Firebase:", e); showToast("Erro ao comunicar com servidor", true); }); 
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
        if(mudou) { 
            if(sortFunc) sortFunc(arrayLocal); 
            if(renderFunc) renderFunc(); 
        }
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
    var elLoad = document.getElementById('loading-screen'); if(elLoad) elLoad.style.display = 'none';
    if (user) { 
        var elLogin = document.getElementById('login-screen'); if(elLogin) elLogin.style.display = 'none'; 
        var elSair = document.getElementById('btnSair'); if(elSair) elSair.style.display = 'inline-block'; 
        nuvemRef = db.collection("workspaces_3d4you").doc(user.uid); 
        iniciarApp(); 
    } else { 
        var elLogin = document.getElementById('login-screen'); if(elLogin) elLogin.style.display = 'flex'; 
        var elSair = document.getElementById('btnSair'); if(elSair) elSair.style.display = 'none'; 
        if (unsubscribeSnapshot) unsubscribeSnapshot(); 
    }
});

window.fazerLogin = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return; document.getElementById('loading-screen').style.display = 'flex'; auth.signInWithEmailAndPassword(email, senha).catch(error => { document.getElementById('loading-screen').style.display = 'none'; var elErr = document.getElementById('loginError'); if(elErr) { elErr.textContent = "Erro: " + error.message; elErr.style.display = 'block'; } }); };
window.criarConta = function() { var email = document.getElementById('authEmail').value, senha = document.getElementById('authSenha').value; if(!email || !senha) return showToast("❌ Preencha e-mail e senha!", true); document.getElementById('loading-screen').style.display = 'flex'; auth.createUserWithEmailAndPassword(email, senha).then(() => { showToast("✅ Conta criada!"); }).catch(error => { document.getElementById('loading-screen').style.display = 'none'; var elErr = document.getElementById('loginError'); if(elErr) { elErr.textContent = "Erro: " + error.message; elErr.style.display = 'block'; } }); };
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
    itemDate.setHours(0,0,0,0); today.setHours(0,0,0,0); 
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

window.handleUploadMain = function(input) { 
    var file = input.files[0]; if (!file) return; 
    var formData = new FormData(); formData.append("image", file); 
    var elLoad = document.getElementById('loading-screen'); if(elLoad) elLoad.style.display = 'flex'; 
    var h2 = elLoad ? elLoad.querySelector('h2') : null;
    var oldText = h2 ? h2.textContent : ""; 
    if(h2) h2.textContent = "A anexar foto..."; 
    fetch("https://api.imgbb.com/1/upload?key=50b2518403427e60b75a8074dc495b15", { method: "POST", body: formData })
    .then(r => r.json()).then(data => { 
        if(elLoad) elLoad.style.display = 'none'; 
        if(h2) h2.textContent = oldText; 
        if (data.success) { 
            var url = data.data.display_url; 
            var elFoto = document.getElementById('fotoUrlProjeto'); if(elFoto) elFoto.value = url; 
            salvarDinamico('fotoUrlProjeto'); 
            var prev = document.getElementById('previewFotoMain'); 
            if(prev) { prev.style.backgroundImage = `url('${url}')`; prev.style.display = "block"; }
            showToast("📸 Foto anexada com sucesso!"); 
        } else { showToast("❌ Erro no upload", true); } 
        input.value = ""; 
    }).catch(() => { 
        if(elLoad) elLoad.style.display = 'none'; 
        if(h2) h2.textContent = oldText; 
        showToast("❌ Erro de rede", true); 
        input.value = ""; 
    }); 
};

window.removerFotoMain = function() { 
    if(confirm("Deseja remover esta foto do projeto?")) { 
        var elFoto = document.getElementById('fotoUrlProjeto'); if(elFoto) elFoto.value = ""; 
        localStorage.removeItem('3d4y_dark_fotoUrlProjeto'); 
        var prev = document.getElementById('previewFotoMain'); 
        if(prev) { prev.style.display = "none"; prev.style.backgroundImage = "none"; }
    } 
};

window.uploadingCatalogId = null;
window.handleUploadCat = function(input) { 
    var file = input.files[0]; if (!file) return; 
    var formData = new FormData(); formData.append("image", file); 
    var elLoad = document.getElementById('loading-screen'); if(elLoad) elLoad.style.display = 'flex'; 
    var h2 = elLoad ? elLoad.querySelector('h2') : null, oldText = h2 ? h2.textContent : ""; 
    if(h2) h2.textContent = "A anexar foto..."; 
    fetch("https://api.imgbb.com/1/upload?key=50b2518403427e60b75a8074dc495b15", { method: "POST", body: formData })
    .then(r => r.json()).then(data => { 
        if(elLoad) elLoad.style.display = 'none'; 
        if(h2) h2.textContent = oldText; 
        if (data.success) { 
            var url = data.data.display_url; 
            var elFCat = document.getElementById('fotoUrlCat'); if(elFCat) elFCat.value = url; 
            var prev = document.getElementById('previewFotoCat'); 
            if(prev) { prev.style.backgroundImage = `url('${url}')`; prev.style.display = "block"; }
            var btnRem = document.getElementById('btnRemoverFotoCat'); if(btnRem) btnRem.style.display = "block"; 
            showToast("📸 Foto pronta para salvar!"); 
        } else { showToast("❌ Erro no upload", true); } 
        input.value = ""; 
    }).catch(() => { 
        if(elLoad) elLoad.style.display = 'none'; 
        if(h2) h2.textContent = oldText; 
        showToast("❌ Erro de rede", true); 
        input.value = ""; 
    }); 
};

window.removerFotoCat = function() { 
    var f = document.getElementById('fotoUrlCat'); if(f) f.value = ""; 
    var p = document.getElementById('previewFotoCat'); if(p) { p.style.display = "none"; p.style.backgroundImage = "none"; } 
    var b = document.getElementById('btnRemoverFotoCat'); if(b) b.style.display = "none"; 
};

window.toggleCard = function(id, el, event) { 
    if(event && (event.target.tagName === 'INPUT' || event.target.classList.contains('slider-switch') || event.target.classList.contains('switch') || event.target.tagName === 'BUTTON')) return; 
    var content = document.getElementById(id), chevron = el.querySelector('.chevron'); 
    if(!content) return;
    if(content.style.display === 'none') { 
        content.style.display = 'block'; 
        if(chevron) chevron.style.transform = 'rotate(0deg)'; 
    } else { 
        content.style.display = 'none'; 
        if(chevron) chevron.style.transform = 'rotate(-90deg)'; 
    } 
};

function atualizarListaClientes() { 
    clientesCadastrados = {}; 
    historico.forEach(function(item) { 
        if (item.cliente && item.cliente.trim() !== '') { 
            if (!clientesCadastrados[item.cliente] && item.telefone) { 
                clientesCadastrados[item.cliente] = item.telefone; 
            } 
        } 
    }); 
    var dl = document.getElementById('listaClientes'); 
    if (dl) { 
        dl.innerHTML = ''; 
        for (var c in clientesCadastrados) { dl.innerHTML += `<option value="${c}">`; } 
    } 
}

function checarClienteAutoFill() { 
    var el = document.getElementById('nomeCliente');
    if(!el) return;
    var nome = el.value; 
    if (clientesCadastrados[nome]) { 
        var elTel = document.getElementById('telefoneCliente');
        if(elTel) { elTel.value = clientesCadastrados[nome]; salvarDinamico('telefoneCliente'); }
    } 
}

function mascaraData(el) { 
    if(!el) return; 
    var val = el.value.replace(/\D/g, ''); 
    if(val.length > 8) val = val.slice(0, 8); 
    if(val.length >= 5) { val = val.slice(0,2) + '/' + val.slice(2,4) + '/' + val.slice(4); } 
    else if(val.length >= 3) { val = val.slice(0,2) + '/' + val.slice(2); } 
    el.value = val; 
}

function aplicarMascara(el) { 
    if (!el) return; 
    var start = el.selectionStart, oldVal = el.value, partsDot = oldVal.split('.'); 
    if (partsDot.length === 2 && oldVal.indexOf(',') === -1 && partsDot[1].length <= 3) { oldVal = oldVal.replace('.', ','); } 
    var v = oldVal.replace(/\./g, '').replace(/[^0-9,]/g, ''), parts = v.split(','); 
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join(''); 
    var intPart = parts[0]; 
    if (intPart) { 
        if (intPart.length > 1 && intPart.charAt(0) === '0') { intPart = parseInt(intPart, 10).toString(); } 
        intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
    } 
    var newVal = parts.length > 1 ? intPart + ',' + parts[1] : intPart; 
    if (el.value !== newVal) { 
        el.value = newVal; 
        var newStart = start + (newVal.length - oldVal.length); 
        if (newStart < 0) newStart = 0; 
        try { el.setSelectionRange(newStart, newStart); } catch(e) {} 
    } 
}

function mascaraTelefone(el) { 
    if (!el) return; 
    var val = el.value.replace(/\D/g, ''); 
    if (val.length > 11) val = val.slice(0, 11); 
    if (val.length > 2) val = '(' + val.slice(0,2) + ') ' + val.slice(2); 
    if (val.length > 10) val = val.slice(0, 10) + '-' + val.slice(10); 
    el.value = val; 
}

function formatarMoeda(num) { var n = parseFloat(num); if (isNaN(n)) return "0,00"; return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pegaValor(id) { var el = document.getElementById(id); if (!el || !el.value) return 0; return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0; }
function pegaTexto(id) { var el = document.getElementById(id); if (el) { return el.value || ''; } return ''; }
function parseLocal(val) { if (val === undefined || val === null || val === '') return 0; if (typeof val === 'number') return val; var str = val.toString(); if (str.includes(',') && str.includes('.')) { return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0; } if (str.includes(',')) { return parseFloat(str.replace(',', '.')) || 0; } return parseFloat(str) || 0; }
function salvarDinamico(idCampo) { var el = document.getElementById(idCampo); if (el) { localStorage.setItem('3d4y_dark_' + idCampo, el.value); } }
function salvarDinamicoValor(idCampo, valor) { var el = document.getElementById(idCampo); if (el) el.value = valor; localStorage.setItem('3d4y_dark_' + idCampo, valor); }
var dynIds = ['nomeProjeto', 'nomeCliente', 'telefoneCliente', 'pesoPeca', 'tempoH', 'valorPersonalizado', 'tipoFilamento1', 'corFilamento1', 'marcaFilamento1', 'qtdPecasProjeto', 'precoFixoCatMain', 'fotoUrlProjeto', 'dataProjeto', 'idPedidoMarketplace', 'obsVenda', 'prazoDias'];
function updateSliderProgress(slider) { if (!slider) return; var value = (slider.value - slider.min) / (slider.max - slider.min) * 100; slider.style.background = 'linear-gradient(to right, #3b82f6 ' + value + '%, #334155 ' + value + '%)'; }

// ==========================================
// 5. MODAIS E CONFIGURAÇÕES (BLINDADO)
// ==========================================

window.abrirConfigModal = function() { 
    window.oldBaseVals = { maq: pegaValor('maquina'), vid: pegaValor('vidaUtil'), con: pegaValor('consumoW'), kwh: pegaValor('precoKwh') }; 
    var m = document.getElementById('configModal'); if(m) m.style.display='block'; 
};

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

window.resetarQA = function() { 
    if(confirm("Manutenção realizada?")) { 
        window.qaOffset = window.horasTotaisImpressasGlobal; 
        syncNuvem(); 
        var m = document.getElementById('configModal'); if(m) m.style.display='none'; 
        showToast("🔧 Manutenção Zerada!"); 
    } 
};

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
// 6. CATÁLOGO, ESTOQUE E DESPESAS (BLINDADO)
// ==========================================

function limparFantasmasMultiCor() { 
    for(var i=2; i<=15; i++) { 
        localStorage.removeItem('3d4y_dark_tipoFilamento'+i); 
        localStorage.removeItem('3d4y_dark_corFilamento'+i); 
        localStorage.removeItem('3d4y_dark_marcaFilamento'+i); 
        localStorage.removeItem('3d4y_dark_precoFilamento'+i); 
        localStorage.removeItem('3d4y_dark_pesoPeca'+i); 
    } 
    var qCores=document.getElementById('qtdCoresExtras'); if(qCores) qCores.value="1"; 
    if(typeof renderCoresExtras==='function') renderCoresExtras(); 
}

function resetarInputProjeto() { 
    var elNome = document.getElementById('nomeProjeto'); if(elNome) elNome.value=""; 
    var elQtd = document.getElementById('qtdPecasProjeto'); if(elQtd) elQtd.value="1"; 
    var elT = document.getElementById('tempoH'); if(elT) elT.value=""; 
    var elP = document.getElementById('pesoPeca'); if(elP) elP.value=""; 
    var sel1 = document.getElementById('sel_est_1'); if(sel1) sel1.value=""; 
    var elT1 = document.getElementById('tipoFilamento1'); if(elT1) elT1.value=""; 
    var elC1 = document.getElementById('corFilamento1'); if(elC1) elC1.value=""; 
    var elM1 = document.getElementById('marcaFilamento1'); if(elM1) elM1.value=""; 
    var elPr = document.getElementById('precoFilamento'); if(elPr) elPr.value="120,00"; 
    var d1 = document.getElementById('detalhes_1'); if(d1) d1.style.display='none'; 
    var tMulti = document.getElementById('toggle_multi_mat'); 
    if(tMulti && tMulti.checked) { tMulti.checked=false; tMulti.dispatchEvent(new Event('change')); } 
    var elF = document.getElementById('fotoUrlProjeto'); if(elF) elF.value=""; 
    var prev = document.getElementById('previewFotoMain'); if(prev) prev.style.display="none"; 
    var dp = document.getElementById('dataProjeto'); if(dp) { dp.value=new Date().toLocaleDateString('pt-BR'); salvarDinamico('dataProjeto'); } 
    ['nomeProjeto','qtdPecasProjeto','tempoH','pesoPeca','tipoFilamento1','corFilamento1','marcaFilamento1','precoFilamento','precoFixoCatMain','fotoUrlProjeto'].forEach(id=>localStorage.removeItem('3d4y_dark_'+id)); 
    limparFantasmasMultiCor(); 
}

function preencherFormProjeto(prod) { 
    var match=prod.nome.match(/^(\d+)x\s(.*)/), qtd=match?parseInt(match[1]):(prod.qtd||1), baseNome=match?match[2]:prod.nome; 
    var elN = document.getElementById('nomeProjeto'); if(elN) elN.value=baseNome; 
    var elQ = document.getElementById('qtdPecasProjeto'); if(elQ) elQ.value=qtd; 
    var matchCat=catalogo.find(c=>c.nome.toLowerCase().trim()===baseNome.toLowerCase().trim()), selCat=document.getElementById('sel_catalogo'); 
    if(matchCat) { if(selCat) selCat.value=matchCat.id.toString(); } else { if(selCat) selCat.value=""; } 
    
    var p_tipo1=prod.tipo1||(matchCat?matchCat.tipo1:""), p_cor1=prod.cor1||(matchCat?matchCat.cor1:""), p_marca1=prod.marca1||(matchCat?matchCat.marca1:""), p_preco1=prod.preco1||(matchCat?matchCat.preco1:"120,00"), p_multi=prod.multi!==undefined?prod.multi:(matchCat?matchCat.multi:false), p_qtdCores=prod.qtdCores||(matchCat?matchCat.qtdCores:"1"), p_extras=prod.extras||(matchCat?matchCat.extras:[]); 
    
    var elTH = document.getElementById('tempoH'); if(elTH) elTH.value=prod.tempo1||(prod.tempo?formatarMoeda((prod.tempo)/qtd):(matchCat?matchCat.tempo:"")); 
    var elPP = document.getElementById('pesoPeca'); if(elPP) elPP.value=prod.peso1||(prod.peso?formatarMoeda((prod.peso)/qtd):(matchCat?matchCat.peso1:"")); 
    
    if(prod.taxaSucesso) { var elTS = document.getElementById('taxaSucesso'); if(elTS) elTS.value=prod.taxaSucesso; } 
    if(prod.margemLucro) { 
        var elMI = document.getElementById('margemInput'); if(elMI) elMI.value=prod.margemLucro; 
        var elMS = document.getElementById('margemSlider'); if(elMS) { elMS.value=prod.margemLucro; updateSliderProgress(elMS); }
    } 
    
    var elTF1 = document.getElementById('tipoFilamento1'); if(elTF1) elTF1.value=p_tipo1; 
    var elCF1 = document.getElementById('corFilamento1'); if(elCF1) elCF1.value=p_cor1; 
    var elMF1 = document.getElementById('marcaFilamento1'); if(elMF1) elMF1.value=p_marca1; 
    var elPF = document.getElementById('precoFilamento'); if(elPF) elPF.value=p_preco1; 
    
    var match1=null; if(p_tipo1) { match1=estoque.find(e=>e.tipo===p_tipo1&&e.cor===p_cor1&&e.marca===p_marca1)||estoque.find(e=>e.tipo===p_tipo1&&e.cor===p_cor1); } 
    var sel1=document.getElementById('sel_est_1'); 
    if(match1) { 
        if(sel1) sel1.value=match1.id.toString(); 
        var eM = document.getElementById('marcaFilamento1'); if(eM) eM.value=match1.marca; 
        var eP = document.getElementById('precoFilamento'); if(eP) eP.value=match1.preco; 
    } else { if(sel1) sel1.value=""; } 
    
    var d1 = document.getElementById('detalhes_1'); if(d1) d1.style.display=(p_tipo1)?'block':'none'; 
    var fotoUrl=prod.foto||(matchCat?matchCat.foto:""); 
    var eF = document.getElementById('fotoUrlProjeto'); if(eF) eF.value=fotoUrl; salvarDinamico('fotoUrlProjeto'); 
    var preview=document.getElementById('previewFotoMain'); 
    if(fotoUrl) { if(preview) { preview.style.backgroundImage=`url('${fotoUrl}')`; preview.style.display="block"; } } else { if(preview) preview.style.display="none"; } 
    
    limparFantasmasMultiCor(); 
    var tMulti=document.getElementById('toggle_multi_mat'); 
    if(tMulti) { tMulti.checked=p_multi; tMulti.dispatchEvent(new Event('change')); } 
    
    if(p_multi&&p_extras&&p_extras.length>0) { 
        var eQ = document.getElementById('qtdCoresExtras'); if(eQ) eQ.value=p_qtdCores; 
        p_extras.forEach((ex,idx)=>{ var i=idx+2; salvarDinamicoValor('tipoFilamento'+i,ex.tipo||""); salvarDinamicoValor('corFilamento'+i,ex.cor||""); salvarDinamicoValor('marcaFilamento'+i,ex.marca||""); salvarDinamicoValor('precoFilamento'+i,ex.preco||""); salvarDinamicoValor('pesoPeca'+i,ex.peso||""); }); 
        renderCoresExtras(); 
        p_extras.forEach((ex,idx)=>{ 
            var i=idx+2; 
            setTimeout(()=>{ 
                var matchI=null; if(ex.tipo) { matchI=estoque.find(e=>e.tipo===ex.tipo&&e.cor===ex.cor&&e.marca===ex.marca)||estoque.find(e=>e.tipo===ex.tipo&&e.cor===ex.cor); } 
                var selI=document.getElementById('sel_est_'+i); 
                if(matchI) { 
                    if(selI) selI.value=matchI.id.toString(); 
                    var epI = document.getElementById('precoFilamento'+i); if(epI) epI.value=matchI.preco; 
                    var emI = document.getElementById('marcaFilamento'+i); if(emI) emI.value=matchI.marca; 
                } else { if(selI) selI.value=""; } 
            },50); 
        }); 
    } else { 
        var eQ2 = document.getElementById('qtdCoresExtras'); if(eQ2) eQ2.value="1"; renderCoresExtras(); 
    } 
    ['nomeProjeto','qtdPecasProjeto','tempoH','pesoPeca'].forEach(id=>salvarDinamico(id)); 
    calcular(); 
}

function adicionarAoCarrinho() { 
    var nomeBase=pegaTexto('nomeProjeto')||"Sem Nome", qtdPecas=parseInt(pegaValor('qtdPecasProjeto'))||1; if(qtdPecas<1) qtdPecas=1; 
    var nomeItem=qtdPecas>1?qtdPecas+"x "+nomeBase:nomeBase;
    var tMulti=document.getElementById('toggle_multi_mat'), multiMatEnabled=tMulti?tMulti.checked:false;
    var tempoItem=pegaValor('tempoH')*qtdPecas, pesoItem=pegaValor('pesoPeca')*qtdPecas;
    var depCalc=(pegaValor('maquina')/(pegaValor('vidaUtil')||1))*tempoItem, eneCalc=(pegaValor('consumoW')/1000)*pegaValor('precoKwh')*tempoItem;
    var precoMatCalc=pegaValor('precoFilamento'); if(precoMatCalc===0) precoMatCalc=120; 
    var matTotalCalc=(precoMatCalc/1000)*pesoItem, materiaisArray=[];
    var t1=pegaTexto('tipoFilamento1'), c1=pegaTexto('corFilamento1'), m1=pegaTexto('marcaFilamento1');
    var nomeMat1=(t1+' '+c1+' '+m1).trim(); if(nomeMat1==='') nomeMat1='Filamento 1'; 
    if(pesoItem>0) materiaisArray.push(nomeMat1+' ('+pesoItem+'g)'); 
    var extras=[]; 
    
    if(multiMatEnabled) { 
        var qtdEx=parseInt(pegaValor('qtdCoresExtras'))||1; 
        for(var i=2; i<=qtdEx+1; i++) { 
            var pesoE=pegaValor('pesoPeca'+i)*qtdPecas; pesoItem+=pesoE; 
            var precoE=pegaValor('precoFilamento'+i); if(precoE===0) precoE=120; 
            matTotalCalc+=(precoE/1000)*pesoE; 
            var ti=pegaTexto('tipoFilamento'+i), ci=pegaTexto('corFilamento'+i), mi=pegaTexto('marcaFilamento'+i);
            var nomeMatI=(ti+' '+ci+' '+mi).trim(); if(nomeMatI==='') nomeMatI='Filamento '+i; 
            if(pesoE>0) materiaisArray.push(nomeMatI+' ('+pesoE+'g)'); 
            extras.push({tipo:ti, cor:ci, marca:mi, preco:pegaTexto('precoFilamento'+i), peso:pegaTexto('pesoPeca'+i)}); 
        } 
    } 
    var sucCalc=pegaValor('taxaSucesso'); if(sucCalc<=0) sucCalc=100; 
    var custoItemCalc=(depCalc+eneCalc+matTotalCalc)/(sucCalc/100), mInputCalc=pegaValor('margemInput'), vDCalc=custoItemCalc+(custoItemCalc*(mInputCalc/100)); 
    var canalSel=document.getElementById('canalVendaSelecionado'); var isPerso=canalSel&&canalSel.value==='Personalizado'; 
    var valPerso=pegaValor('valorPersonalizado'); var precoExatoItem=(isPerso&&valPerso>0)?parseLocal(valPerso):0; 
    
    var elQC = document.getElementById('qtdCoresExtras');
    var novoItem={id:editandoCarrinhoId?editandoCarrinhoId:Date.now()+Math.floor(Math.random()*1000), nome:nomeItem, qtd:qtdPecas, custo:custoItemCalc, valorComLucro:vDCalc, precoVendaExato:precoExatoItem, tempo:tempoItem, peso:pesoItem, materiais:(materiaisArray.length>0?materiaisArray.join(' + '):'Não informado'), tipo1:t1, cor1:c1, marca1:m1, preco1:pegaTexto('precoFilamento'), peso1:pegaTexto('pesoPeca'), tempo1:pegaTexto('tempoH'), multi:multiMatEnabled, qtdCores:elQC?elQC.value:"1", extras:extras, taxaSucesso:pegaTexto('taxaSucesso'), margemLucro:pegaTexto('margemInput'), foto:pegaTexto('fotoUrlProjeto')}; 
    
    if(editandoCarrinhoId) { 
        var idx=carrinho.findIndex(i=>i.id===editandoCarrinhoId); if(idx>-1) carrinho[idx]=novoItem; 
        editandoCarrinhoId=null; 
        var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); 
        if(btnAdd) { btnAdd.textContent="➕ Adicionar Item"; btnAdd.style.background="var(--orange)"; } 
        if(btnCancel) btnCancel.style.display="none"; 
        showToast("🛒 Item atualizado!"); 
    } else { 
        carrinho.push(novoItem); showToast("🛒 Item adicionado!"); 
    } 
    resetarInputProjeto(); 
    if(canalSel) canalSel.value="Direta"; 
    var elPerso=document.getElementById('valorPersonalizado'); if(elPerso) elPerso.value=''; 
    localStorage.removeItem('3d4y_dark_valorPersonalizado'); 
    var cbLiq=document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked=false; 
    if(typeof mostrarValorPersonalizado==='function') mostrarValorPersonalizado(); 
    renderCarrinho(); calcular(); 
}

function cancelarEdicaoCarrinho() { 
    editandoCarrinhoId=null; 
    var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); 
    if(btnAdd) { btnAdd.textContent="➕ Adicionar Item"; btnAdd.style.background="var(--orange)"; } 
    if(btnCancel) btnCancel.style.display="none"; 
    resetarInputProjeto(); calcular(); showToast("❌ Edição cancelada"); 
}

function removerDoCarrinho(id) { carrinho=carrinho.filter(i=>i.id!==id); renderCarrinho(); calcular(); }

function editarItemCarrinho(id) { 
    var item=carrinho.find(i=>i.id===id); if(!item) return; 
    preencherFormProjeto(item); 
    if(item.precoVendaExato&&parseLocal(item.precoVendaExato)>0) { 
        var elCanal=document.getElementById('canalVendaSelecionado'); if(elCanal) elCanal.value='Personalizado'; 
        var elPerso=document.getElementById('valorPersonalizado'); if(elPerso) { elPerso.value=formatarMoeda(parseLocal(item.precoVendaExato)); salvarDinamico('valorPersonalizado'); } 
        if(typeof mostrarValorPersonalizado==='function') mostrarValorPersonalizado(); 
    } 
    editandoCarrinhoId=id; 
    var btnAdd=document.getElementById('btn_add_carrinho'); var btnCancel=document.getElementById('btn_cancelar_edicao'); 
    if(btnAdd) { btnAdd.textContent="💾 Atualizar Item"; btnAdd.style.background="var(--purple)"; } 
    if(btnCancel) btnCancel.style.display="block"; 
    showToast("✏️ Item carregado!"); window.scrollTo({top:0, behavior:'smooth'}); 
}

function renderCarrinho() { 
    var container=document.getElementById('carrinho_container'); var lista=document.getElementById('lista_itens_carrinho'); 
    if(!container||!lista) return; 
    if(carrinho.length===0) { container.style.display='none'; return; } 
    container.style.display='block'; 
    var htmlFinal=""; var totCusto=0, totValorComLucro=0; 
    carrinho.forEach(item=>{ 
        totCusto+=parseLocal(item.custo); totValorComLucro+=parseLocal(item.valorComLucro); 
        var htmlFoto=item.foto?`<div style="width:30px; height:30px; border-radius:4px; background-image:url('${item.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>`:''; 
        var txtVendaBase=item.precoVendaExato&&parseLocal(item.precoVendaExato)>0?`Venda Fixada: R$ ${formatarMoeda(parseLocal(item.precoVendaExato))}`:`Venda Base: R$ ${formatarMoeda(parseLocal(item.valorComLucro))}`; 
        htmlFinal+=`<div style="background: #0f172a; padding: 8px; border-radius: 8px; position: relative; border: 1px solid var(--border); display:flex; align-items:center;">${htmlFoto}<div style="flex:1;"><button onclick="editarItemCarrinho(${item.id})" style="position: absolute; right: 35px; top: 5px; background: none; border: none; color: var(--sky); font-size: 1rem; cursor: pointer;">✎</button><button onclick="removerDoCarrinho(${item.id})" style="position: absolute; right: 5px; top: 5px; background: none; border: none; color: #ef4444; font-size: 1rem; font-weight: bold; cursor: pointer;">×</button><div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); padding-right: 50px;">${item.nome}</div><div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 3px;">Custo Peça: R$ ${formatarMoeda(parseLocal(item.custo))} | ${txtVendaBase}</div></div></div>`; 
    }); 
    lista.innerHTML=htmlFinal; 
    
    var totalQtd=carrinho.reduce((a,b)=>a+parseLocal(b.qtd),0); if(totalQtd<1) totalQtd=1; 
    var cLog=pegaValor('custoEmbalagem')+pegaValor('custoDeslocamento'); var frete=pegaValor('valorFreteManual'); 
    var totS=0, totM=0, totD=0, totBaseForRatio=totValorComLucro===0?1:totValorComLucro; 
    
    carrinho.forEach(i=>{ 
        var iQtd=parseLocal(i.qtd||1), iPrecoExato=parseLocal(i.precoVendaExato||0), iValLucro=parseLocal(i.valorComLucro||0); 
        if(iPrecoExato>0) { totS+=iPrecoExato; totM+=iPrecoExato; totD+=iPrecoExato; } 
        else { 
            var itemRatio=iValLucro/totBaseForRatio, itemBaseTotal=iValLucro+(cLog*itemRatio), itemBaseUnit=itemBaseTotal/iQtd; 
            var p1=(itemBaseUnit+4)/0.80, p2=(itemBaseUnit+16)/0.86, p3=(itemBaseUnit+20)/0.86, p4=(itemBaseUnit+26)/0.86, bestPShp; 
            if(p1<=79.99) bestPShp=p1; else if(p2<=99.99) bestPShp=p2; else if(p3<=199.99) bestPShp=p3; else bestPShp=p4; 
            totS+=(Math.round(bestPShp*100)/100)*iQtd; 
            var txMl=pegaValor('taxaMeli')/100, pAvgML_noFix=itemBaseUnit/(1-txMl); 
            var bestPMeli=(pAvgML_noFix>=79.99)?pAvgML_noFix:(itemBaseUnit+pegaValor('fixaMeli'))/(1-txMl); 
            totM+=(Math.round(bestPMeli*100)/100)*iQtd; totD+=itemBaseTotal; 
        } 
    }); 
    totD+=frete; 
    var eCC = document.getElementById('cart_tot_custo'); if(eCC) eCC.textContent=formatarMoeda(totCusto); 
    var eVD = document.getElementById('cart_tot_vd'); if(eVD) eVD.textContent=formatarMoeda(totD); 
    var eVS = document.getElementById('cart_tot_vs'); if(eVS) eVS.textContent=formatarMoeda(totS); 
    var eVM = document.getElementById('cart_tot_vm'); if(eVM) eVM.textContent=formatarMoeda(totM); 
}

window.cancelarEdicaoCatalogo = function() { 
    editCatalogoId=null; 
    var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background="var(--orange)"; } 
    var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="none"; 
    resetarInputProjeto(); 
    var selC = document.getElementById('sel_catalogo'); if(selC) selC.value=""; 
    var bP = document.getElementById('boxPrecoFixo'); if(bP) bP.style.display='none'; 
    var pF = document.getElementById('precoFixoCatMain'); if(pF) pF.value=""; 
    localStorage.removeItem('3d4y_dark_precoFixoCatMain'); 
    calcular(); showToast("❌ Edição cancelada"); 
};

function salvarNoCatalogo() { 
    var nome=pegaTexto('nomeProjeto'); if(!nome) { showToast("❌ Dê um nome ao projeto.", true); return; } 
    var precoFixo=pegaTexto('precoFixoCatMain'), fotoUrl=pegaTexto('fotoUrlProjeto'), extras=[]; 
    var tM = document.getElementById('toggle_multi_mat'); var multiOn= tM ? tM.checked : false; 
    if(multiOn) { 
        var qtd=parseInt(pegaValor('qtdCoresExtras'))||1; 
        for(var i=2; i<=qtd+1; i++) { 
            extras.push({tipo:pegaTexto('tipoFilamento'+i), cor:pegaTexto('corFilamento'+i), marca:pegaTexto('marcaFilamento'+i), preco:pegaTexto('precoFilamento'+i), peso:pegaTexto('pesoPeca'+i)}); 
        } 
    } 
    var existe=catalogo.find(p=>p.nome.toLowerCase().trim()===nome.toLowerCase().trim()); 
    if(editCatalogoId) { 
        if(existe&&existe.id!==editCatalogoId) { showToast("❌ Nome já existe.", true); return; } 
        var idx=catalogo.findIndex(p=>p.id===editCatalogoId); 
        if(idx>-1) { 
            var pAntigo=catalogo[idx]; 
            var nomeMinusculo=(pAntigo.nome||"").toLowerCase().trim(); 
            var vendasAfetadas=historico.filter(h=>{ if(h.vendaIsolada) return false; var nomeHistoricoClean=(h.nome||"").toLowerCase().trim().replace(/^\d+x\s/,''); return nomeHistoricoClean===nomeMinusculo; }); 
            if(vendasAfetadas.length>0) { 
                if(confirm(`Atualizar CUSTO em ${vendasAfetadas.length} vendas padrão deste produto no histórico?`)) { 
                    var nMaq=pegaValor('maquina'), nVid=pegaValor('vidaUtil'), nCon=pegaValor('consumoW'), nKwh=pegaValor('precoKwh'), custoHoraBase=(nMaq/(nVid||1))+((nCon/1000)*nKwh), novoTempoUnit=pegaValor('tempoH'), novoPesoUnit=pegaValor('pesoPeca'), precoFilamentoUnit=pegaValor('precoFilamento')||120, taxaSucesso=(pegaValor('taxaSucesso')||100)/100; 
                    vendasAfetadas.forEach(h=>{ 
                        var qtdItem=parseLocal(h.totalQtd||1); h.tempo=novoTempoUnit*qtdItem; h.peso=novoPesoUnit*qtdItem; h.custo=((h.tempo*custoHoraBase)+((h.peso*precoFilamentoUnit)/1000))/taxaSucesso; 
                        salvarNoFirebase('historico', h); 
                    }); 
                } 
            } 
            pAntigo.nome=nome; pAntigo.precoFixo=precoFixo; pAntigo.peso1=pegaTexto('pesoPeca'); pAntigo.tipo1=pegaTexto('tipoFilamento1'); pAntigo.cor1=pegaTexto('corFilamento1'); pAntigo.marca1=pegaTexto('marcaFilamento1'); pAntigo.preco1=pegaTexto('precoFilamento'); pAntigo.tempo=pegaTexto('tempoH'); pAntigo.multi=multiOn; pAntigo.qtdCores=multiOn?pegaTexto('qtdCoresExtras'):"0"; pAntigo.extras=extras; pAntigo.foto=fotoUrl; 
            salvarNoFirebase('catalogo', pAntigo); 
        } 
        editCatalogoId=null; 
        var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Salvar Novo Projeto no Catálogo"; btnMain.style.background="var(--orange)"; } 
        var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="none"; 
        showToast("🏷️ Produto atualizado!"); 
    } else { 
        if(existe) { showToast("❌ O projeto JÁ EXISTE no Catálogo!", true); return; } 
        var eQC = document.getElementById('qtdCoresExtras');
        var novoProduto={id:Date.now(), nome:nome, precoFixo:precoFixo, peso1:pegaTexto('pesoPeca'), tipo1:pegaTexto('tipoFilamento1'), cor1:pegaTexto('corFilamento1'), marca1:pegaTexto('marcaFilamento1'), preco1:pegaTexto('precoFilamento'), tempo:pegaTexto('tempoH'), multi:multiOn, qtdCores:multiOn?(eQC?eQC.value:"0"):"0", extras:extras, foto:fotoUrl}; 
        salvarNoFirebase('catalogo', novoProduto); 
        showToast("🏷️ Produto salvo no catálogo!"); 
    } 
    var ePF = document.getElementById('precoFixoCatMain'); if(ePF) ePF.value=""; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); 
    var eBP = document.getElementById('boxPrecoFixo'); if(eBP) eBP.style.display='none'; 
    resetarDados(); 
}

function renderCatalogo() { 
    var sel=document.getElementById('sel_catalogo'); var lista=document.getElementById('lista_catalogo'); if(!sel||!lista) return; 
    var htmlSel='<option value="">-- Escolher produto cadastrado --</option>'; 
    var htmlLista='<div style="margin-bottom:15px; text-align:center;"><button onclick="sincronizarTudoComCatalogo()" style="background:var(--purple); width:100%; padding:10px; border-radius:8px; color:#fff; font-weight:bold; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:8px; transition:0.2s;"><span style="font-size:1.2rem">🔄</span> Sincronizar CUSTOS com o Catálogo Atual</button></div>'; 
    if(catalogo.length===0) { 
        htmlLista+='<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Nenhum produto cadastrado</p>'; 
    } else { 
        catalogo.forEach(function(p) { 
            htmlSel+=`<option value="${p.id}">${p.nome}</option>`; 
            var pesoTotal=parseLocal(p.peso1); 
            if(p.multi&&p.extras&&p.extras.length>0) { p.extras.forEach(function(ex) { pesoTotal+=parseLocal(ex.peso); }); } 
            var pesoStr=formatarMoeda(pesoTotal)+'g', htmlPrecoFixo=p.precoFixo&&parseFloat(p.precoFixo.replace('.','').replace(',','.'))>0?' | Venda Fixo: R$ '+p.precoFixo:'', htmlFoto=p.foto?`<div style="width:40px; height:40px; border-radius:6px; background-image:url('${p.foto}'); background-size:cover; background-position:center; margin-right:10px; border:1px solid var(--border); flex-shrink:0;"></div>`:''; 
            htmlLista+=`<div class="history-item"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">${htmlFoto}<div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; word-wrap: break-word;">${p.nome}</h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Tempo: ${p.tempo}h | Peso Total: ${pesoStr}${htmlPrecoFixo}</div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarDoCatalogo(${p.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerDoCatalogo(${p.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`; 
        }); 
    } 
    sel.innerHTML=htmlSel; lista.innerHTML=htmlLista; 
}

function carregarDoCatalogo() { 
    var selC = document.getElementById('sel_catalogo');
    var id= selC ? selC.value : ""; 
    if(!id) { 
        resetarInputProjeto(); 
        var elC = document.getElementById('canalVendaSelecionado'); if(elC) elC.value="Direta"; 
        var elVP = document.getElementById('valorPersonalizado'); if(elVP) elVP.value=""; 
        mostrarValorPersonalizado(); 
        var boxPreco=document.getElementById('boxPrecoFixo'); if(boxPreco) boxPreco.style.display='none'; 
        var elPFC = document.getElementById('precoFixoCatMain'); if(elPFC) elPFC.value=''; 
        calcular(); return; 
    } 
    aplicarDadosNoForm(id, false); showToast("🏷️ Dados carregados!"); 
}

function editarDoCatalogo(id) { 
    aplicarDadosNoForm(id, true); 
    editCatalogoId=id; 
    var btnMain=document.getElementById('btn_salvar_catalogo_main'); if(btnMain) { btnMain.textContent="💾 Confirmar Edição no Catálogo"; btnMain.style.background="var(--sky)"; } 
    var btnCancel=document.getElementById('btn_cancelar_catalogo_main'); if(btnCancel) btnCancel.style.display="inline-block"; 
    window.fecharModal('catalogoModal'); window.fecharGaveta(); window.scrollTo({top:0, behavior:'smooth'}); 
    showToast("✏️ Produto carregado!"); 
}

function aplicarDadosNoForm(id, isEditing=false) { 
    var p=catalogo.find(e=>e.id.toString()===id.toString()); if(!p) return; 
    var fakeProd={nome:p.nome, qtd:1, tempo1:p.tempo, peso1:p.peso1, tipo1:p.tipo1, cor1:p.cor1, marca1:p.marca1, preco1:p.preco1, multi:p.multi, qtdCores:p.qtdCores, extras:p.extras, foto:p.foto}; 
    preencherFormProjeto(fakeProd); 
    var elPrecoFixo=document.getElementById('precoFixoCatMain'); var boxPreco=document.getElementById('boxPrecoFixo'); 
    if(isEditing) { 
        if(elPrecoFixo&&boxPreco) { boxPreco.style.display='flex'; elPrecoFixo.value=p.precoFixo||''; salvarDinamico('precoFixoCatMain'); } 
    } else { 
        if(boxPreco) boxPreco.style.display='none'; 
        if(elPrecoFixo) { elPrecoFixo.value=''; localStorage.removeItem('3d4y_dark_precoFixoCatMain'); } 
    } 
    if(p.precoFixo&&parseFloat(p.precoFixo.replace('.','').replace(',','.'))>0) { 
        var cVS = document.getElementById('canalVendaSelecionado'); if(cVS) cVS.value='Personalizado'; 
        var vP = document.getElementById('valorPersonalizado'); if(vP) { vP.value=p.precoFixo; salvarDinamico('valorPersonalizado'); }
        mostrarValorPersonalizado(); 
    } else { 
        var cVS2 = document.getElementById('canalVendaSelecionado'); if(cVS2) cVS2.value='Direta'; 
        var vP2 = document.getElementById('valorPersonalizado'); if(vP2) { vP2.value=''; salvarDinamico('valorPersonalizado'); }
        mostrarValorPersonalizado(); 
    } 
    calcular(); 
}
function removerDoCatalogo(id) { if(confirm("Deseja apagar este produto do catálogo?")) { apagarNoFirebase('catalogo', id); } }

window.cancelarEdicaoEstoque = function() { 
    editEstoqueId=null; 
    var eT = document.getElementById('est_tipo'); if(eT) eT.value=""; 
    var eC = document.getElementById('est_cor'); if(eC) eC.value=""; 
    var eM = document.getElementById('est_marca'); if(eM) eM.value=""; 
    var eP = document.getElementById('est_preco'); if(eP) eP.value=""; 
    var bS = document.getElementById('btn_salvar_estoque'); if(bS) bS.textContent="➕ Salvar"; 
    var bC = document.getElementById('btn_cancelar_estoque'); if(bC) bC.style.display="none"; 
    showToast("❌ Edição cancelada"); 
};
function salvarItemEstoque() { 
    var t=pegaTexto('est_tipo'), c=pegaTexto('est_cor'), m=pegaTexto('est_marca');
    var elP = document.getElementById('est_preco'); var p= elP ? elP.value : ""; 
    if(!t||!p) { showToast("❌ Preencha pelo menos o Tipo e o Preço.", true); return; } 
    if(editEstoqueId) { 
        var item=estoque.find(e=>e.id===editEstoqueId); 
        if(item) { item.tipo=t; item.cor=c; item.marca=m; item.preco=p; let novoP=prompt("Peso atual em gramas:", item.pesoAtual!==undefined?item.pesoAtual:1000); if(novoP!==null) item.pesoAtual=parseLocal(novoP); salvarNoFirebase('estoque', item); } 
        editEstoqueId=null; 
        var bS = document.getElementById('btn_salvar_estoque'); if(bS) bS.textContent="➕ Salvar / Atualizar"; 
        var bC = document.getElementById('btn_cancelar_estoque'); if(bC) bC.style.display="none"; 
        showToast("📦 Atualizado!"); 
    } else { 
        let novoP=prompt("Peso inicial em gramas:", "1000"); let pesoSalvar=novoP!==null?parseLocal(novoP):1000; 
        var novo={id:Date.now(), tipo:t, cor:c, marca:m, preco:p, pesoAtual:pesoSalvar}; salvarNoFirebase('estoque', novo); showToast("📦 Adicionado!"); 
    } 
    var eT = document.getElementById('est_tipo'); if(eT) eT.value=""; 
    var eC = document.getElementById('est_cor'); if(eC) eC.value=""; 
    var eM = document.getElementById('est_marca'); if(eM) eM.value=""; 
    var ePr = document.getElementById('est_preco'); if(ePr) ePr.value=""; 
}

function renderEstoque() { 
    var lista=document.getElementById('lista_estoque'); if(!lista) return; 
    if(estoque.length===0) { lista.innerHTML='<p style="text-align:center; color:var(--text-muted); font-size:0.7rem;">Estoque Vazio</p>'; } 
    else { 
        var htmlFinal=""; 
        estoque.forEach(function(item) { 
            var pesoAtual=item.pesoAtual!==undefined?item.pesoAtual:1000; var corPeso=pesoAtual<200?'#ef4444':(pesoAtual<500?'#facc15':'#10b981'); 
            htmlFinal+=`<div class="history-item"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;"><div style="flex: 1; min-width: 0;"><h4 style="margin:0; line-height: 1.3; color:var(--success); word-wrap: break-word;">${item.tipo} ${item.cor} <span style="color:#fff">(${item.marca})</span></h4><div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">Preço: R$ ${item.preco} | <span style="color:${corPeso}; font-weight:bold;">Restante: ${formatarMoeda(pesoAtual)}g</span></div></div><div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);"><button onclick="editarItemEstoque(${item.id})" style="color:var(--sky);background:none;border:none;font-size:1rem;cursor:pointer;padding:0;" title="Editar">✎</button><button onclick="removerItemEstoque(${item.id})" style="color:#ef4444;background:none;border:none;font-size:1.4rem;cursor:pointer;line-height:0.8;padding:0;" title="Excluir">×</button></div></div></div>`; 
        }); 
        lista.innerHTML=htmlFinal; 
    } 
    atualizarDropdownsEstoque(); 
}

function removerItemEstoque(id) { if(confirm("Deseja apagar este material?")) { apagarNoFirebase('estoque', id); } }
function editarItemEstoque(id) { 
    var item=estoque.find(e=>e.id===id); 
    if(item) { 
        var eT = document.getElementById('est_tipo'); if(eT) eT.value=item.tipo; 
        var eC = document.getElementById('est_cor'); if(eC) eC.value=item.cor; 
        var eM = document.getElementById('est_marca'); if(eM) eM.value=item.marca; 
        var eP = document.getElementById('est_preco'); if(eP) eP.value=item.preco; 
        editEstoqueId=id; 
        var bS = document.getElementById('btn_salvar_estoque'); if(bS) bS.textContent="💾 Confirmar"; 
        var bC = document.getElementById('btn_cancelar_estoque'); if(bC) bC.style.display="block"; 
    } 
}

function atualizarDropdownsEstoque() { 
    var optionsHTML='<option value="">-- Puxar material --</option>'; 
    estoque.forEach(function(item) { optionsHTML+='<option value="'+item.id+'">'+(item.tipo+' '+item.cor+' ('+item.marca+') - R$ '+item.preco).trim()+'</option>'; }); 
    var s1=document.getElementById('sel_est_1'); if(s1) { var val1=s1.value; s1.innerHTML=optionsHTML; s1.value=val1; } 
    var qtd=parseInt(pegaValor('qtdCoresExtras'))||1; 
    for(var i=2; i<=qtd+1; i++) { var si=document.getElementById('sel_est_'+i); if(si) { var vali=si.value; si.innerHTML=optionsHTML; si.value=vali; } } 
}

function puxarDoEstoque(indexStr) { 
    var sel=document.getElementById('sel_est_'+indexStr), det=document.getElementById('detalhes_'+indexStr); 
    if(!sel||!sel.value) { if(det) det.style.display='none'; return; } 
    var item=estoque.find(e=>e.id.toString()===sel.value); if(!item) return; 
    var idx=parseInt(indexStr), sTipo=idx===1?'tipoFilamento1':'tipoFilamento'+idx, sCor=idx===1?'corFilamento1':'corFilamento'+idx, sMarca=idx===1?'marcaFilamento1':'marcaFilamento'+idx, sPreco=idx===1?'precoFilamento':'precoFilamento'+idx; 
    var elT=document.getElementById(sTipo); if(elT) { elT.value=item.tipo; salvarDinamico(sTipo); } 
    var elC=document.getElementById(sCor); if(elC) { elC.value=item.cor; salvarDinamico(sCor); } 
    var elM=document.getElementById(sMarca); if(elM) { elM.value=item.marca; salvarDinamico(sMarca); } 
    var elP=document.getElementById(sPreco); if(elP) { elP.value=item.preco; aplicarMascara(elP); salvarDinamico(sPreco); } 
    if(det) det.style.display='block'; 
    var campoPeso=idx===1?document.getElementById('pesoPeca'):document.getElementById('pesoPeca'+idx); 
    if(campoPeso) { campoPeso.focus(); if(campoPeso.value==="0"||campoPeso.value==="0,00"||campoPeso.value==="") { campoPeso.select(); } } 
    calcular(); showToast("📦 Carregado!"); 
}

function renderCoresExtras() { 
    var qtdInput=document.getElementById('qtdCoresExtras'); if(!qtdInput) return; 
    var qtd=parseInt(pegaValor('qtdCoresExtras'))||1, container=document.getElementById('container_cores_extras'); if(!container) return; 
    var htmlFinal=""; 
    for(var i=2; i<=qtd+1; i++) { 
        var sTipo=localStorage.getItem('3d4y_dark_tipoFilamento'+i)||'', sCor=localStorage.getItem('3d4y_dark_corFilamento'+i)||'', sMarca=localStorage.getItem('3d4y_dark_marcaFilamento'+i)||'', sPreco=localStorage.getItem('3d4y_dark_precoFilamento'+i)||'', sPeso=localStorage.getItem('3d4y_dark_pesoPeca'+i)||''; 
        if(sPreco.indexOf('.')!==-1&&sPreco.indexOf(',')===-1) sPreco=sPreco.replace(/\./g,','); 
        if(sPeso.indexOf('.')!==-1&&sPeso.indexOf(',')===-1) sPeso=sPeso.replace(/\./g,','); 
        htmlFinal+=`<div class="filament-box" style="margin-top:10px;"><span class="filament-box-title">Filamento ${i}</span><div class="input-group" style="margin-bottom: 8px;"><select id="sel_est_${i}" style="border-color: var(--success); color: var(--success); background: rgba(16, 185, 129, 0.05);" onchange="puxarDoEstoque('${i}')"><option value="">-- Puxar material do Estoque --</option></select></div><div id="detalhes_${i}" class="detalhes-material" style="${sTipo?'display:block':''}"><div class="grid-3" style="margin-bottom: 8px;"><div class="input-group"><label>Tipo</label><input type="text" id="tipoFilamento${i}" value="${sTipo}" placeholder="Ex: PETG" readonly></div><div class="input-group"><label>Cor</label><input type="text" id="corFilamento${i}" value="${sCor}" placeholder="Ex: Branco" readonly></div><div class="input-group"><label>Marca</label><input type="text" id="marcaFilamento${i}" value="${sMarca}" placeholder="Ex: 3DLab" readonly></div></div><div class="input-group"><label>Preço Pago (R$/kg)</label><input type="text" inputmode="decimal" id="precoFilamento${i}" value="${sPreco}" readonly></div></div><div class="input-group" style="margin-top: 10px;"><label style="color: var(--sky); font-weight: 800;">Peso da Peça (g)</label><input type="text" inputmode="decimal" id="pesoPeca${i}" value="${sPeso}" class="peso-destaque" placeholder="0" oninput="aplicarMascara(this); salvarDinamico('pesoPeca${i}'); calcular()"></div></div>`; 
    } 
    container.innerHTML=htmlFinal; 
    for(var i=2; i<=qtd+1; i++) { var el = document.getElementById('pesoPeca'+i); if(el) aplicarMascara(el); } 
    atualizarDropdownsEstoque(); calcular(); 
}

function mostrarValorPersonalizado() { 
    var seletor=document.getElementById('canalVendaSelecionado'), divPersonalizado=document.getElementById('divValorPersonalizado'); 
    if(seletor&&divPersonalizado) { if(seletor.value==='Personalizado') { divPersonalizado.style.display='block'; } else { divPersonalizado.style.display='none'; } } 
}

function calcularSimulador() { 
    var vVenda=pegaValor('simuladorVenda'), elS=document.getElementById('sim_shopee'), elM=document.getElementById('sim_meli'); 
    if(vVenda<=0) { if(elS) elS.textContent="0,00"; if(elM) elM.textContent="0,00"; return; } 
    var isCart=carrinho&&carrinho.length>0, totalQtd=isCart?carrinho.reduce((a,b)=>a+b.qtd,0):(parseInt(pegaValor('qtdPecasProjeto'))||1); if(totalQtd<1) totalQtd=1; 
    var net=descontarTaxas(vVenda, totalQtd, isCart?carrinho:null); 
    if(elS) elS.textContent=formatarMoeda(net.shopee); if(elM) elM.textContent=formatarMoeda(net.meli); 
}

window.cancelarEdicaoDespesa = function() { 
    editDespesaId=null; 
    var elQ = document.getElementById('desp_qtd'); if(elQ) elQ.value="1"; 
    var elN = document.getElementById('desp_nome'); if(elN) elN.value=""; 
    var elV = document.getElementById('desp_valor'); if(elV) elV.value=""; 
    var elDD=document.getElementById('dataDespesa'); if(elDD) elDD.value=new Date().toLocaleDateString('pt-BR'); 
    var bS = document.getElementById('btn_salvar_despesa'); if(bS) bS.textContent="➕ Adicionar"; 
    var bC = document.getElementById('btn_cancelar_despesa'); if(bC) bC.style.display="none"; 
    showToast("❌ Edição cancelada"); 
};

function salvarDespesa() { 
    var qtd=parseInt(pegaValor('desp_qtd'))||1, nome=pegaTexto('desp_nome');
    var elV = document.getElementById('desp_valor'); var val=elV ? elV.value : ""; 
    var dataInput=pegaTexto('dataDespesa')||new Date().toLocaleDateString('pt-BR'); 
    if(!nome||!val) { showToast("❌ Preencha o produto/material e o valor.", true); return; } 
    if(editDespesaId) { 
        var item=despesas.find(d=>d.id===editDespesaId); 
        if(item) { item.qtd=qtd; item.nome=nome; item.valor=parseLocal(val); item.data=dataInput; salvarNoFirebase('despesas', item); } 
        editDespesaId=null; 
        var bS = document.getElementById('btn_salvar_despesa'); if(bS) bS.textContent="➕ Adicionar"; 
        var bC = document.getElementById('btn_cancelar_despesa'); if(bC) bC.style.display="none"; 
        showToast("💸 Despesa Atualizada!"); 
    } else { 
        var nova={id:Date.now(), data:dataInput, qtd:qtd, nome:nome, valor:parseLocal(val)}; salvarNoFirebase('despesas', nova); showToast("💸 Registrada!"); 
    } 
    var elQ2 = document.getElementById('desp_qtd'); if(elQ2) elQ2.value="1"; 
    var elN2 = document.getElementById('desp_nome'); if(elN2) elN2.value=""; 
    var elV2 = document.getElementById('desp_valor'); if(elV2) elV2.value=""; 
    var elDD2=document.getElementById('dataDespesa'); if(elDD2) elDD2.value=new Date().toLocaleDateString('pt-BR'); 
}

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
function editarDespesa(id) { 
    var d=despesas.find(e=>e.id===id); 
    if(d) { 
        var elQ = document.getElementById('desp_qtd'); if(elQ) elQ.value=d.qtd; 
        var elN = document.getElementById('desp_nome'); if(elN) elN.value=d.nome; 
        var elV = document.getElementById('desp_valor'); if(elV) elV.value=formatarMoeda(d.valor); 
        var elDD=document.getElementById('dataDespesa'); if(elDD) elDD.value=d.data||new Date().toLocaleDateString('pt-BR'); 
        editDespesaId=id; 
        var bS = document.getElementById('btn_salvar_despesa'); if(bS) bS.textContent="💾 Confirmar"; 
        var bC = document.getElementById('btn_cancelar_despesa'); if(bC) bC.style.display="block"; 
    } 
}
// ==========================================
// 12. CÁLCULOS E VENDAS E HISTÓRICO
// ==========================================

function atualizarLucroReal() { 
    var elTLucro = document.getElementById('tot_lucro'); var valLucro = elTLucro ? parseLocal(elTLucro.textContent) : 0;
    var elTDesp = document.getElementById('tot_despesas'); var valDesp = elTDesp ? parseLocal(elTDesp.textContent) : 0;
    var real = valLucro - valDesp;
    var elReal = document.getElementById('tot_lucro_real'); if(elReal) elReal.textContent = formatarMoeda(real); 
    
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

window.cancelarEdicaoVenda = function() { 
    editHistoricoId = null; 
    var bSave = document.getElementById('btn_salvar_venda_main');
    if(bSave) { bSave.textContent = "💾 Salvar Venda"; bSave.style.background = "var(--purple)"; } 
    var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); 
    if(btnCancelVenda) btnCancelVenda.style.display = "none"; 
    resetarDados(); 
    showToast("❌ Edição de venda cancelada"); 
}

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

window.isDraggingFiltro = false; 
window.mudarFiltro = function(status) { 
    if (window.isDraggingFiltro) return; 
    window.filtroStatusAtual = status; renderHistorico(); 
};

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
    var qCores = document.getElementById('qtdCoresExtras'); if(qCores) { qCores.addEventListener('input', renderCoresExtras); } if(pegaTexto('tipoFilamento1')) { var d1 = document.getElementById('detalhes_1'); if(d1) d1.style.display = 'block'; }
    renderCoresExtras(); var mSli = document.getElementById('margemSlider'); if(mSli) { updateSliderProgress(mSli); } if(pegaTexto('precoFixoCatMain')) { var bPF = document.getElementById('boxPrecoFixo'); if(bPF) bPF.style.display = 'flex'; } calcular(); mostrarValorPersonalizado();
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

// 🔥 AQUI ESTAVA O SEU BUG: Esta função agora é blindada!
function salvarHistorico() {
    var cliNome = pegaTexto('nomeCliente') || "", cliTel = pegaTexto('telefoneCliente') || "";
    var elCanal = document.getElementById('canalVendaSelecionado'); var originalCanal = elCanal ? elCanal.value : "Direta"; var canal = originalCanal;
    var tUrgente = document.getElementById('toggle_urgente'); var isUrgente = tUrgente ? tUrgente.checked : false;
    var cbLiq = document.getElementById('isLiquidoExato'); var isLiquidoExato = (cbLiq && cbLiq.checked && originalCanal === 'Personalizado');
    
    var dataInputForm = pegaTexto('dataProjeto') || new Date().toLocaleDateString('pt-BR');
    var idPedForm = pegaTexto('idPedidoMarketplace') || "", obsVendaForm = pegaTexto('obsVenda') || "", prazoDiasForm = pegaTexto('prazoDias') || "";
    
    var isCart = carrinho && carrinho.length > 0, nomeFinal = "", valorBruto = 0, custoProducaoFinal = 0, pesoFinal = 0, tempoFinal = 0, materiaisArray = [], cLog = 0, freteCalculado = 0, totalQtd = 1, valorCalculadoBruto = 0;
    
    if(isCart) {
        nomeFinal = carrinho.map(i => i.nome).join(' + '); 
        custoProducaoFinal = carrinho.reduce((a,b) => a + parseLocal(b.custo), 0); pesoFinal = carrinho.reduce((a,b) => a + parseLocal(b.peso), 0); tempoFinal = carrinho.reduce((a,b) => a + parseLocal(b.tempo), 0); 
        totalQtd = carrinho.reduce((a,b) => a + parseLocal(b.qtd), 0); if(totalQtd < 1) totalQtd = 1;
        carrinho.forEach(i => { if(i.materiais && i.materiais !== "Não informado") materiaisArray.push(i.materiais); });
        
        var elCS = document.getElementById('cart_tot_vs'), elCM = document.getElementById('cart_tot_vm'), elCD = document.getElementById('cart_tot_vd');
        var cShopee = elCS ? parseLocal(elCS.textContent) : 0, cMeli = elCM ? parseLocal(elCM.textContent) : 0, cDireta = elCD ? parseLocal(elCD.textContent) : 0;
        
        if (canal === "Personalizado") { 
            valorBruto = pegaValor('valorPersonalizado'); 
            var cDest = document.getElementById('canalPersonalizadoDestino'); canal = cDest ? cDest.value : "Direta"; 
            valorCalculadoBruto = (canal === "Shopee") ? cShopee : (canal === "Meli" ? cMeli : cDireta); 
        } else if(canal === "Direta") { valorBruto = cDireta; valorCalculadoBruto = cDireta; } 
        else if(canal === "Shopee") { valorBruto = cShopee; valorCalculadoBruto = cShopee; } else { valorBruto = cMeli; valorCalculadoBruto = cMeli; }
        
        cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); freteCalculado = pegaValor('valorFreteManual');
    } else {
        var nomeBase = pegaTexto('nomeProjeto') || "Sem Nome", qtdPecas = parseInt(pegaValor('qtdPecasProjeto')) || 1; if(qtdPecas < 1) qtdPecas = 1; 
        totalQtd = qtdPecas; nomeFinal = qtdPecas > 1 ? qtdPecas + "x " + nomeBase : nomeBase; 
        
        var elRG = document.getElementById('r_gasto'); custoProducaoFinal = elRG ? parseLocal(elRG.textContent) : 0; 
        tempoFinal = pegaValor('tempoH') * qtdPecas; pesoFinal = pegaValor('pesoPeca') * qtdPecas;
        
        var tm = document.getElementById('toggle_multi_mat'); var multiOn = tm ? tm.checked : false; 
        if(multiOn) { var qtdEx = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i=2; i<=qtdEx+1; i++) { pesoFinal += (pegaValor('pesoPeca'+i) * qtdPecas); } }
        
        cLog = pegaValor('custoEmbalagem') + pegaValor('custoDeslocamento'); freteCalculado = pegaValor('valorFreteManual');
        
        var t1 = pegaTexto('tipoFilamento1'), c1 = pegaTexto('corFilamento1'), m1 = pegaTexto('marcaFilamento1'), p1 = pegaValor('pesoPeca') * qtdPecas, nomeMat1 = (t1 + ' ' + c1 + ' ' + m1).trim(); 
        if (nomeMat1 === '') nomeMat1 = 'Filamento 1'; if(p1 > 0) { materiaisArray.push(nomeMat1 + ' (' + p1 + 'g)'); }
        
        if (multiOn) { var qCores = document.getElementById('qtdCoresExtras'), qtdExtras = qCores ? (parseInt(pegaValor('qtdCoresExtras')) || 1) : 1; for(var i = 2; i <= qtdExtras + 1; i++) { var ti = pegaTexto('tipoFilamento'+i), ci = pegaTexto('corFilamento'+i), mi = pegaTexto('marcaFilamento'+i), pi = pegaValor('pesoPeca'+i) * qtdPecas, nomeMatI = (ti + ' ' + ci + ' ' + mi).trim(); if (nomeMatI === '') nomeMatI = 'Filamento ' + i; if(pi > 0) { materiaisArray.push(nomeMatI + ' (' + pi + 'g)'); } } }
        
        var elRS = document.getElementById('r_vendaS'), elRM = document.getElementById('r_vendaM'), elRD = document.getElementById('r_vendaD');
        var rS = elRS ? parseLocal(elRS.textContent) : 0, rM = elRM ? parseLocal(elRM.textContent) : 0, rD = elRD ? parseLocal(elRD.textContent) : 0;
        
        if (canal === "Personalizado") { 
            valorBruto = pegaValor('valorPersonalizado'); 
            var cD2 = document.getElementById('canalPersonalizadoDestino'); canal = cD2 ? cD2.value : "Direta"; 
            valorCalculadoBruto = (canal === "Shopee") ? rS : (canal === "Meli" ? rM : rD); 
        } else if(canal === "Direta") { valorBruto = rD; valorCalculadoBruto = rD; } 
        else if(canal === "Shopee") { valorBruto = rS; valorCalculadoBruto = rS; } else { valorBruto = rM; valorCalculadoBruto = rM; }
    }
    
    var oldItem = null; if (editHistoricoId) { oldItem = historico.find(h => h.id === editHistoricoId); }
    var freteFinal = (canal === "Shopee" || canal === "Meli") ? 0 : freteCalculado, net = descontarTaxas(valorBruto, totalQtd, isCart ? carrinho : (oldItem ? oldItem.cartItems : null)), valorVendaFinal = 0;
    
    if (isLiquidoExato) { 
        valorVendaFinal = valorBruto; 
        var fallbackBruto = oldItem ? (oldItem.valorBruto !== undefined ? oldItem.valorBruto : (oldItem.valorLiquido !== undefined ? oldItem.valorLiquido : (oldItem.valorVenda !== undefined ? oldItem.valorVenda : oldItem.pix))) : valorCalculadoBruto; 
        valorBruto = fallbackBruto || valorCalculadoBruto || 0; 
    } else { 
        if(canal === "Shopee") { valorVendaFinal = net.shopee; } 
        else if(canal === "Meli") { valorVendaFinal = net.meli; } else { valorVendaFinal = valorBruto; } 
    }
    if(valorVendaFinal < 0) valorVendaFinal = 0;
    
    var stringMateriais = materiaisArray.length > 0 ? materiaisArray.join(' + ') : 'Não informado';
    var tM2 = document.getElementById('toggle_multi_mat'); var multiOnSave = tM2 ? tM2.checked : false; var extrasArrSave = [];
    if(multiOnSave) { var qtdExSave = parseInt(pegaValor('qtdCoresExtras')) || 1; for(var i=2; i<=qtdExSave+1; i++) { extrasArrSave.push({ tipo: pegaTexto('tipoFilamento'+i), cor: pegaTexto('corFilamento'+i), marca: pegaTexto('marcaFilamento'+i), preco: pegaTexto('precoFilamento'+i), peso: pegaTexto('pesoPeca'+i) }); } }
    
    var cartToSave = []; 
    if(isCart) { cartToSave = JSON.parse(JSON.stringify(carrinho)); } 
    else { cartToSave.push({ id: Date.now(), nome: nomeFinal, qtd: totalQtd, custo: custoProducaoFinal, valorComLucro: valorVendaFinal, peso: pesoFinal, tempo: tempoFinal, materiais: stringMateriais, tipo1: pegaTexto('tipoFilamento1'), cor1: pegaTexto('corFilamento1'), marca1: pegaTexto('marcaFilamento1'), multi: multiOnSave, qtdCores: pegaTexto('qtdCoresExtras'), extras: extrasArrSave }); }
    
    var isPrazoChanged = oldItem ? (oldItem.prazoDias !== prazoDiasForm || !!oldItem.urgente !== !!isUrgente) : true;
    var pManual = (oldItem && !isPrazoChanged) ? oldItem.posicaoFilaManual : null;
    var urlFotoSalvar = isCart ? (carrinho.length > 0 ? carrinho[0].foto : '') : pegaTexto('fotoUrlProjeto');

    var novo = { 
        id: editHistoricoId ? editHistoricoId : Date.now(), 
        timestampCriacao: oldItem ? (oldItem.timestampCriacao || oldItem.id) : Date.now(), 
        idPedido: idPedForm, nome: nomeFinal || "", cliente: cliNome || "", telefone: cliTel || "", canal: canal || "Direta", materiais: stringMateriais || "Não informado", 
        valorVenda: valorVendaFinal || 0, valorBruto: valorBruto || 0, valorLiquido: valorVendaFinal || 0, custo: custoProducaoFinal || 0, frete: freteFinal || 0, logistica: cLog || 0, 
        peso: pesoFinal || 0, tempo: tempoFinal || 0, cartItems: cartToSave || [], totalQtd: totalQtd || 1, urgente: !!isUrgente, 
        status: oldItem ? (oldItem.status || "Orçamento") : "Orçamento", data: dataInputForm, foto: urlFotoSalvar || "", obsVenda: obsVendaForm, prazoDias: prazoDiasForm, 
        posicaoFilaManual: pManual, estoqueBaixado: oldItem ? !!oldItem.estoqueBaixado : false, vendaIsolada: editHistoricoId ? true : (oldItem ? !!oldItem.vendaIsolada : false) 
    };
    
    salvarNoFirebase('historico', novo);
    
    if (editHistoricoId) { 
        editHistoricoId = null; 
        var bSMain = document.getElementById('btn_salvar_venda_main'); if(bSMain) { bSMain.textContent = "💾 Salvar Venda"; bSMain.style.background = "var(--purple)"; } 
        var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "none"; 
    }
    if (cliNome.trim() !== '') { if (!clientesCadastrados[cliNome] && cliTel) { clientesCadastrados[cliNome] = cliTel; var dl = document.getElementById('listaClientes'); if (dl) { dl.innerHTML += `<option value="${cliNome}">`; } } }
    var elPerso = document.getElementById('valorPersonalizado'); if(elPerso) elPerso.value = ''; localStorage.removeItem('3d4y_dark_valorPersonalizado'); 
    resetarDados(); showToast("✅ Venda Registrada!");
}

function editarItemHistorico(id) {
    var item = historico.find(h => h.id === id); if (!item) return;
    carrinho = []; var cc = document.getElementById('carrinho_container'); if(cc) cc.style.display = 'none';
    var prod; if (item.cartItems && item.cartItems.length === 1) { prod = item.cartItems[0]; } else if (item.cartItems && item.cartItems.length > 1) { carrinho = JSON.parse(JSON.stringify(item.cartItems)); renderCarrinho(); var eQ = document.getElementById('qtdPecasProjeto'); if(eQ) eQ.value = "1"; var eNP = document.getElementById('nomeProjeto'); if(eNP) eNP.value = ""; var eTH = document.getElementById('tempoH'); if(eTH) eTH.value = ""; var ePP = document.getElementById('pesoPeca'); if(ePP) ePP.value = ""; } else { var matchOld = item.nome.match(/^(\d+)x\s(.*)/), qtdOld = matchOld ? parseInt(matchOld[1]) : (item.totalQtd || 1); prod = { nome: item.nome, qtd: qtdOld, tempo: item.tempo, peso: item.peso }; }
    
    if (prod) { 
        var match = prod.nome.match(/^(\d+)x\s(.*)/), qtd = match ? parseInt(match[1]) : (prod.qtd || item.totalQtd || 1), baseNome = match ? match[2] : prod.nome; 
        var elNP2 = document.getElementById('nomeProjeto'); if(elNP2) elNP2.value = baseNome; 
        var elQP2 = document.getElementById('qtdPecasProjeto'); if(elQP2) elQP2.value = qtd; 
        var elTH2 = document.getElementById('tempoH'); if(elTH2) elTH2.value = formatarMoeda((prod.tempo || item.tempo) / qtd); 
        var elPP2 = document.getElementById('pesoPeca'); if(elPP2) elPP2.value = formatarMoeda((prod.peso || item.peso) / qtd); 
        
        var matchCat = catalogo.find(c => c.nome.toLowerCase().trim() === baseNome.toLowerCase().trim()), selCat = document.getElementById('sel_catalogo'); if(matchCat) { if(selCat) selCat.value = matchCat.id.toString(); } else { if(selCat) selCat.value = ""; } 
        
        var eTF1 = document.getElementById('tipoFilamento1'); if(eTF1) eTF1.value = prod.tipo1 || ""; 
        var eCF1 = document.getElementById('corFilamento1'); if(eCF1) eCF1.value = prod.cor1 || ""; 
        var eMF1 = document.getElementById('marcaFilamento1'); if(eMF1) eMF1.value = prod.marca1 || ""; 
        
        var match1 = null; if(prod.tipo1) { match1 = estoque.find(e => e.tipo === prod.tipo1 && e.cor === prod.cor1 && e.marca === prod.marca1) || estoque.find(e => e.tipo === prod.tipo1 && e.cor === prod.cor1); } 
        var sel1 = document.getElementById('sel_est_1'); 
        if(match1) { if(sel1) sel1.value = match1.id.toString(); var eM = document.getElementById('marcaFilamento1'); if(eM) eM.value = match1.marca; var eP = document.getElementById('precoFilamento'); if(eP) eP.value = match1.preco; } else { if(sel1) sel1.value = ""; } 
        
        var det1 = document.getElementById('detalhes_1'); if(det1) det1.style.display = (prod.tipo1) ? 'block' : 'none'; 
        limparFantasmasMultiCor(); 
        var tMulti = document.getElementById('toggle_multi_mat'); if(tMulti) { tMulti.checked = prod.multi || false; tMulti.dispatchEvent(new Event('change')); } 
        if(prod.multi && prod.extras) { 
            var eQC2 = document.getElementById('qtdCoresExtras'); if(eQC2) eQC2.value = prod.qtdCores || "1"; 
            prod.extras.forEach((ex, idx) => { var i = idx + 2; salvarDinamicoValor('tipoFilamento'+i, ex.tipo || ""); salvarDinamicoValor('corFilamento'+i, ex.cor || ""); salvarDinamicoValor('marcaFilamento'+i, ex.marca || ""); salvarDinamicoValor('precoFilamento'+i, ex.preco || ""); salvarDinamicoValor('pesoPeca'+i, ex.peso || ""); }); renderCoresExtras(); 
            prod.extras.forEach((ex, idx) => { var i = idx + 2; setTimeout(() => { var matchI = null; if(ex.tipo) { matchI = estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor && e.marca === ex.marca) || estoque.find(e => e.tipo === ex.tipo && e.cor === ex.cor); } var selI = document.getElementById('sel_est_'+i); if(matchI) { if(selI) selI.value = matchI.id.toString(); var epI = document.getElementById('precoFilamento'+i); if(epI) epI.value = matchI.preco; var emI = document.getElementById('marcaFilamento'+i); if(emI) emI.value = matchI.marca; } else { if(selI) selI.value = ""; var epI2 = document.getElementById('precoFilamento'+i); if(epI2) epI2.value = ex.preco || "120,00"; var emI2 = document.getElementById('marcaFilamento'+i); if(emI2) emI2.value = ex.marca || ""; } }, 50); }); 
        } 
        salvarDinamico('nomeProjeto'); salvarDinamico('qtdPecasProjeto'); salvarDinamico('tempoH'); salvarDinamico('pesoPeca'); 
    }
    
    if (item.foto) { var eFU = document.getElementById('fotoUrlProjeto'); if(eFU) eFU.value = item.foto; salvarDinamico('fotoUrlProjeto'); var preview = document.getElementById('previewFotoMain'); if(preview) { preview.style.backgroundImage = `url('${item.foto}')`; preview.style.display = "block"; } } 
    else { var eFU2 = document.getElementById('fotoUrlProjeto'); if(eFU2) eFU2.value = ""; var p = document.getElementById('previewFotoMain'); if(p) p.style.display = "none"; }
    
    var eNC = document.getElementById('nomeCliente'); if(eNC) eNC.value = item.cliente || ""; 
    var eTC = document.getElementById('telefoneCliente'); if(eTC) eTC.value = item.telefone || ""; 
    var elDataP = document.getElementById('dataProjeto'); if (elDataP) { elDataP.value = item.data || new Date().toLocaleDateString('pt-BR'); salvarDinamico('dataProjeto'); } 
    var elIdPed = document.getElementById('idPedidoMarketplace'); if(elIdPed) { elIdPed.value = item.idPedido || ""; salvarDinamico('idPedidoMarketplace'); } 
    var elObs = document.getElementById('obsVenda'); if(elObs) { elObs.value = item.obsVenda || ""; salvarDinamico('obsVenda'); } 
    var elPrazo = document.getElementById('prazoDias'); if(elPrazo) { elPrazo.value = item.prazoDias || ""; salvarDinamico('prazoDias'); }
    
    var tUrgente = document.getElementById('toggle_urgente'); if (tUrgente) { tUrgente.checked = !!item.urgente; tUrgente.dispatchEvent(new Event('change')); }
    
    var elCanal = document.getElementById('canalVendaSelecionado'), elDest = document.getElementById('canalPersonalizadoDestino'), elPerso = document.getElementById('valorPersonalizado');
    if (item.valorBruto !== undefined && item.valorBruto > 0) { 
        if(elCanal) elCanal.value = "Personalizado"; 
        if(elDest) elDest.value = item.canal || "Direta"; 
        if(elPerso) elPerso.value = formatarMoeda(item.valorBruto); salvarDinamico('valorPersonalizado'); 
    } else { 
        var canalReal = item.canal === "Direta" || item.canal === "Shopee" || item.canal === "Meli" ? item.canal : "Personalizado"; 
        if (canalReal === "Personalizado") { 
            if(elCanal) elCanal.value = "Personalizado"; 
            if(elDest) elDest.value = item.canal || "Direta"; 
            if(elPerso) elPerso.value = formatarMoeda(item.valorLiquido || item.valorVenda); salvarDinamico('valorPersonalizado'); 
        } else { 
            if(elCanal) elCanal.value = canalReal; 
            if(elPerso) elPerso.value = ""; localStorage.removeItem('3d4y_dark_valorPersonalizado'); 
        } 
    }
    
    mostrarValorPersonalizado(); 
    var cbLiq = document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked = false; 
    
    if (item.logistica > 0 || item.frete > 0) { 
        var qtd = item.totalQtd || 1; 
        var eCE = document.getElementById('custoEmbalagem'); if(eCE) eCE.value = formatarMoeda((item.logistica || 0) / qtd); 
        var eCD = document.getElementById('custoDeslocamento'); if(eCD) eCD.value = "0,00"; 
        var vFrete = document.getElementById('valorFreteManual'); if(vFrete) vFrete.value = formatarMoeda(item.frete || 0); 
    }
    
    calcular(); editHistoricoId = id; 
    var btnSV = document.getElementById('btn_salvar_venda_main'); if(btnSV) { btnSV.textContent = "💾 Confirmar Edição de Venda"; btnSV.style.background = "var(--sky)"; } 
    var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "block"; 
    showToast("✏️ Venda carregada para edição!"); 
    var dash = document.querySelector('.dashboard'); if(dash) dash.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mudarStatus(id, novoStatus) { 
    setTimeout(function() {
        var index = historico.findIndex(h => h.id === id); 
        if (index > -1) { 
            var h = historico[index]; h.status = novoStatus; 
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
    var eTQ = document.getElementById('tot_qtd'); if(eTQ) eTQ.textContent = qtdValida; 
    var eTC = document.getElementById('tot_custo'); if(eTC) eTC.textContent = formatarMoeda(somaCusto); 
    var eTL = document.getElementById('tot_logistica'); if(eTL) eTL.textContent = formatarMoeda(somaLogistica); 
    var eTFB = document.getElementById('tot_faturamento_bruto'); if(eTFB) eTFB.textContent = formatarMoeda(somaBruto); 
    var eTF = document.getElementById('tot_faturamento'); if(eTF) eTF.textContent = formatarMoeda(somaLiquido); 
    var eTLu = document.getElementById('tot_lucro'); if(eTLu) eTLu.textContent = formatarMoeda(somaLucro); 
    var divDev = document.getElementById('tot_devolucoes'); if(divDev) divDev.textContent = formatarMoeda(totDevolvido); 
    var eQD = document.getElementById('qtd_direta'); if(eQD) eQD.textContent = qtdDireta; 
    var eTDi = document.getElementById('tot_direta'); if(eTDi) eTDi.textContent = formatarMoeda(somaDireta); 
    var eQS = document.getElementById('qtd_shopee'); if(eQS) eQS.textContent = qtdShopee; 
    var eTSh = document.getElementById('tot_shopee'); if(eTSh) eTSh.textContent = formatarMoeda(somaShopee); 
    var eQM = document.getElementById('qtd_meli'); if(eQM) eQM.textContent = qtdMeli; 
    var eTMe = document.getElementById('tot_meli'); if(eTMe) eTMe.textContent = formatarMoeda(somaMeli); 
    atualizarLucroReal();
}

function removerItem(id) { if(confirm("Deseja apagar este projeto do histórico?")) { apagarNoFirebase('historico', id); } }

function resetarDados() {
    carrinho = []; renderCarrinho(); 
    var eF = document.getElementById('fotoUrlProjeto'); if(eF) eF.value = ""; 
    var p = document.getElementById('previewFotoMain'); if(p) p.style.display = "none";
    ['nomeCliente', 'telefoneCliente', 'valorPersonalizado', 'precoFixoCatMain', 'idPedidoMarketplace', 'obsVenda', 'prazoDias'].forEach(id => { var el = document.getElementById(id); if(el) { el.value = ""; localStorage.removeItem('3d4y_dark_' + id); } });
    var cE = document.getElementById('custoEmbalagem'); if(cE) cE.value = window.configGlobais.custoEmbalagem || "0,00"; 
    var cD = document.getElementById('custoDeslocamento'); if(cD) cD.value = window.configGlobais.custoDeslocamento || "0,00"; 
    var vF = document.getElementById('valorFreteManual'); if(vF) vF.value = "0,00";
    var selCat = document.getElementById('sel_catalogo'); if(selCat) selCat.value = ""; 
    var boxPreco = document.getElementById('boxPrecoFixo'); if(boxPreco) boxPreco.style.display = 'none';
    var cbLiq = document.getElementById('isLiquidoExato'); if(cbLiq) cbLiq.checked = false; 
    editCatalogoId = null; 
    var btnMainCat = document.getElementById('btn_salvar_catalogo_main'); if(btnMainCat) { btnMainCat.textContent = "💾 Salvar Novo Projeto no Catálogo"; btnMainCat.style.background = "var(--orange)"; } 
    var btnCancelCatMain = document.getElementById('btn_cancelar_catalogo_main'); if(btnCancelCatMain) btnCancelCatMain.style.display = "none";
    editHistoricoId = null; 
    var btnSaveMain = document.getElementById('btn_salvar_venda_main'); if(btnSaveMain) { btnSaveMain.textContent = "💾 Salvar Venda"; btnSaveMain.style.background = "var(--purple)"; } 
    var btnCancelVenda = document.getElementById('btn_cancelar_edicao_venda'); if(btnCancelVenda) btnCancelVenda.style.display = "none";
    editandoCarrinhoId = null; 
    var btnAdd = document.getElementById('btn_add_carrinho'); if(btnAdd) { btnAdd.textContent = "➕ Adicionar Item"; btnAdd.style.background = "var(--orange)"; } 
    var btnCancel = document.getElementById('btn_cancelar_edicao'); if(btnCancel) btnCancel.style.display = "none";
    var tUrgente = document.getElementById('toggle_urgente'); if (tUrgente && tUrgente.checked) { tUrgente.checked = false; tUrgente.dispatchEvent(new Event('change')); }
    var cDestino = document.getElementById('canalPersonalizadoDestino'); if(cDestino) cDestino.value = 'Shopee';
    var dp = document.getElementById('dataProjeto'); if (dp) { dp.value = new Date().toLocaleDateString('pt-BR'); salvarDinamico('dataProjeto'); }
    resetarInputProjeto(); calcular(); 
    setTimeout(() => { showToast("✅ Limpo!"); }, 100); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

window.encurtarUrl = async function(url) { if (!url || url.length < 35) return url; try { let res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://is.gd/create.php?format=json&url=' + encodeURIComponent(url))}`); let data = await res.json(); let innerData = JSON.parse(data.contents); return innerData.shorturl || url; } catch(e) { return url; } };
window.wpp = async function(tipo) {
    var w = window.open('', '_blank'); if(w) w.document.write('<h3 style="font-family:sans-serif; text-align:center; margin-top:20vh; color:#3b82f6;">A gerar link curto do WhatsApp... Aguarde ⏳</h3>');
    var txt = "*Orçamento 3D 4You*\n\n", valF = 0, isCart = carrinho && carrinho.length > 0;
    var elCanalSel = document.getElementById('canalVendaSelecionado'); var isPersonalizado = elCanalSel ? elCanalSel.value === 'Personalizado' : false; 
    var elCansPerso = document.getElementById('canalPersonalizadoDestino'); var canalPerso = elCansPerso ? elCansPerso.value : "Direta";
    if(isCart) { 
        txt += "*Itens do Pedido:*\n"; 
        for (let i of carrinho) { txt += "- " + i.nome + "\n"; if(i.foto) { let linkCurto = await encurtarUrl(i.foto); txt += "  📷 Ver Peça: " + linkCurto + "\n"; } } 
        var elD = document.getElementById('cart_tot_vd'), elS = document.getElementById('cart_tot_vs'), elM = document.getElementById('cart_tot_vm');
        valF = tipo === 'direta' ? (elD?elD.textContent:"0") : (tipo === 'shopee' ? (elS?elS.textContent:"0") : (elM?elM.textContent:"0")); 
    } else { 
        var nProj = document.getElementById('nomeProjeto'), nome = nProj && nProj.value ? nProj.value : "Peça 3D", elQtd = document.getElementById('qtdPecasProjeto'), qtd = elQtd && elQtd.value !== "1" ? elQtd.value + "x " : ""; 
        txt += "*Projeto:* " + qtd + nome + "\n"; var fotoUrl = pegaTexto('fotoUrlProjeto'); if (fotoUrl) { let linkCurto = await encurtarUrl(fotoUrl); txt += "📷 *Ver Peça:* " + linkCurto + "\n"; } 
        var elRD = document.getElementById('r_vendaD'), elRS = document.getElementById('r_vendaS'), elRM = document.getElementById('r_vendaM');
        valF = tipo === 'direta' ? (elRD?elRD.textContent:"0") : (tipo === 'shopee' ? (elRS?elRS.textContent:"0") : (elRM?elRM.textContent:"0")); 
    }
    if (isPersonalizado) { var vPerso = pegaTexto('valorPersonalizado'); if (vPerso) { if ((tipo === 'direta' && canalPerso === 'Direta') || (tipo === 'shopee' && canalPerso === 'Shopee') || (tipo === 'meli' && canalPerso === 'Meli')) { valF = vPerso; } } }
    txt += "\n*Valor Total:* R$ " + valF; 
    var tCli = document.getElementById('telefoneCliente'), tel = tCli && tCli.value ? tCli.value.replace(/\D/g, '') : ""; var finalUrl = "https://wa.me/" + (tel ? "55"+tel : "") + "?text=" + encodeURIComponent(txt);
    if(w) { w.location.href = finalUrl; } else { window.open(finalUrl, '_blank'); }
};

window.gerarOrcamentoPDF = async function() {
    showToast("⏳ A gerar PDF com links... Aguarde!", false); const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(20); doc.text("ORÇAMENTO - 3D 4You", 14, 20); doc.setFontSize(12); doc.text("Data: " + new Date().toLocaleDateString('pt-BR'), 14, 30);
    var cliNome = pegaTexto('nomeCliente') || "Cliente Balcão"; doc.text("Cliente: " + cliNome, 14, 38);
    var isCart = carrinho && carrinho.length > 0, valF = 0;
    var elCSel = document.getElementById('canalVendaSelecionado'); var tipoCanal = elCSel ? elCSel.value : "Direta";
    var isPersonalizado = tipoCanal === 'Personalizado';
    if(isCart) { 
        var eVD = document.getElementById('cart_tot_vd'), eVS = document.getElementById('cart_tot_vs'), eVM = document.getElementById('cart_tot_vm');
        valF = tipoCanal === 'Direta' ? (eVD?eVD.textContent:"0") : (tipoCanal === 'Shopee' ? (eVS?eVS.textContent:"0") : (eVM?eVM.textContent:"0")); 
    } else { 
        var eRD = document.getElementById('r_vendaD'), eRS = document.getElementById('r_vendaS'), eRM = document.getElementById('r_vendaM');
        valF = tipoCanal === 'Direta' ? (eRD?eRD.textContent:"0") : (tipoCanal === 'Shopee' ? (eRS?eRS.textContent:"0") : (eRM?eRM.textContent:"0")); 
    }
    if (isPersonalizado) { var vPerso = pegaTexto('valorPersonalizado'); if (vPerso) valF = vPerso; }
    let startY = 50, tableData = [];
    if(isCart) { for(let i of carrinho) { var descItem = i.nome; if(i.foto) { let linkCurto = await encurtarUrl(i.foto); descItem += "\n📷 Link da Foto: " + linkCurto; } tableData.push([descItem, "R$ " + formatarMoeda(parseLocal(i.valorComLucro))]); } } 
    else { var elNP = document.getElementById('nomeProjeto'); var nProj = elNP ? elNP.value : "Peça 3D"; var elQP = document.getElementById('qtdPecasProjeto'); var qtd = elQP ? elQP.value : "1"; var descItemUnico = qtd + "x " + nProj; var fotoUrl = pegaTexto('fotoUrlProjeto'); if(fotoUrl) { let linkCurto = await encurtarUrl(fotoUrl); descItemUnico += "\n📷 Link da Foto: " + linkCurto; } tableData.push([descItemUnico, "R$ " + valF]); }
    doc.autoTable({ startY: startY, head: [['Descrição do Item', 'Valor Estimado']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { overflow: 'linebreak' } }); let finalY = doc.lastAutoTable.finalY + 15; doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text("VALOR TOTAL: R$ " + valF, 14, finalY); doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text("Orçamento sujeito a alteração. Válido por 7 dias.", 14, finalY + 10);
    doc.save("Orcamento_Cliente_3D4You.pdf"); showToast("✅ Orçamento PDF Gerado!");
};

window.gerarRelatorioGeral = function() {
    if (historico.length === 0) { showToast("⚠️ Nenhum dado para exportar", true); return; }
    var pDias = prompt("Qual período deseja no PDF?\n\nDigite: 30, 60, 90\nOu deixe em branco para exportar TODO O PERÍODO:", window.filtroDiasAtual === 'Total' ? '' : window.filtroDiasAtual); if (pDias === null) return; var diasFiltro = pDias.trim() === '' ? 'Total' : pDias.trim();
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.setFontSize(16); doc.text("Relatório Financeiro Geral - 3D 4You", 14, 15); doc.setFontSize(9); doc.text("Emitido em: " + new Date().toLocaleDateString('pt-BR') + " | Período: " + (diasFiltro === 'Total' ? 'Total' : 'Últimos ' + diasFiltro + ' dias'), 14, 21);
    var histFiltrado = historico.filter(h => isWithinDays(h.data || new Date().toLocaleDateString('pt-BR'), diasFiltro)); var despFiltradas = despesas.filter(d => isWithinDays(d.data || new Date().toLocaleDateString('pt-BR'), diasFiltro));
    let totVendas = 0, totBruto = 0, totLiquido = 0, totCusto = 0, totLucro = 0, totHoras = 0, somaLogistica = 0, totPeso = 0; let qtdDireta = 0, somaDiretaBruto = 0, somaDiretaLiq = 0; let qtdShopee = 0, somaShopeeBruto = 0, somaShopeeLiq = 0; let qtdMeli = 0, somaMeliBruto = 0, somaMeliLiq = 0; let despesasTotais = despFiltradas.reduce((acc, d) => acc + parseLocal(d.valor), 0), totDevolvido = 0;
    const tableDataDevolucoes = [], tableData = []; let usoFilamentos = {};
    histFiltrado.forEach(h => {
        let st = h.status || "Finalizado"; if (st === 'Enviado') st = 'Enviado / Entregue';
        let custoItem = parseLocal(h.custo), freteLogItem = parseLocal(h.frete || 0) + parseLocal(h.logistica || 0), canalStr = h.canal || "Direta", valLiq = h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : (h.valorVenda !== undefined ? parseLocal(h.valorVenda) : parseLocal(h.pix)), valBruto = h.valorBruto !== undefined ? parseLocal(h.valorBruto) : valLiq, lucroItem = valLiq - custoItem - freteLogItem, horas = parseLocal(h.tempo || 0), peso = parseLocal(h.peso || 0);
        if (st === 'Devolução') { totDevolvido += valLiq; tableDataDevolucoes.push([ h.data, h.cliente || 'Balcão', h.nome, st, canalStr, "R$ " + formatarMoeda(valLiq), "R$ " + formatarMoeda(lucroItem), formatarMoeda(horas) + "h" ]); } 
        else {
            tableData.push([ h.data, h.cliente || 'Balcão', h.nome, st, canalStr, "R$ " + formatarMoeda(valBruto), "R$ " + formatarMoeda(valLiq), formatarMoeda(horas) + "h" ]);
            if (st !== 'Orçamento') { totVendas += parseLocal(h.totalQtd || 1); totBruto += valBruto; totLiquido += valLiq; totCusto += custoItem; somaLogistica += freteLogItem; totLucro += lucroItem; if(canalStr === "Shopee") { somaShopeeLiq += valLiq; somaShopeeBruto += valBruto; qtdShopee++; } else if(canalStr === "Meli") { somaMeliLiq += valLiq; somaMeliBruto += valBruto; qtdMeli++; } else { somaDiretaLiq += valLiq; somaDiretaBruto += valBruto; qtdDireta++; } }
            if (st === 'Imprimindo' || st === 'Finalizado' || st === 'Enviado / Entregue') { totHoras += horas; totPeso += peso; if (h.materiais && h.materiais !== "Não informado") { let mats = h.materiais.split(' + '); mats.forEach(m => { let match = m.match(/(.+?)\s+\(([\d.,]+)g\)/); if (match) { let nomeMat = match[1].trim(), pesoMat = parseLocal(match[2]); if (!usoFilamentos[nomeMat]) usoFilamentos[nomeMat] = 0; usoFilamentos[nomeMat] += pesoMat; } }); } }
        }
    });
    let lucroReal = totLucro - despesasTotais; doc.setFillColor(240, 240, 240); doc.rect(14, 25, 268, 52, 'F'); doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text("RESUMO FINANCEIRO (" + (diasFiltro === 'Total' ? 'Todo o Período' : 'Últimos ' + diasFiltro + ' dias') + "):", 18, 32); doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text(`Faturamento Bruto Total: R$ ${formatarMoeda(totBruto)}`, 18, 40); doc.text(`Custo de Produção: R$ ${formatarMoeda(totCusto)}`, 85, 40); doc.text(`Despesas Gerais: R$ ${formatarMoeda(despesasTotais)}`, 160, 40); doc.text(`Faturamento Líquido Total: R$ ${formatarMoeda(totLiquido)}`, 18, 46); doc.text(`Custo Log/Frete: R$ ${formatarMoeda(somaLogistica)}`, 85, 46); doc.text(`Material Gasto: ${formatarMoeda(totPeso)}g (${formatarMoeda(totPeso/1000)}kg)`, 160, 46); doc.setFont(undefined, 'bold'); doc.text(`Lucro da Operação: R$ ${formatarMoeda(totLucro)}`, 18, 54); doc.text(`Tempo de Máquina: ${formatarMoeda(totHoras)}h`, 85, 54); doc.setTextColor(0, 150, 0); doc.text(`CAIXA REAL: R$ ${formatarMoeda(lucroReal)}`, 160, 54); doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.text(`PIX/Direta:`, 18, 64); doc.setFont(undefined, 'normal'); doc.text(`Bruto: R$ ${formatarMoeda(somaDiretaBruto)} | Líquido (Sem Taxas): R$ ${formatarMoeda(somaDiretaLiq)}`, 35, 64); doc.setFont(undefined, 'bold'); doc.text(`Shopee:`, 105, 64); doc.setFont(undefined, 'normal'); doc.text(`Bruto: R$ ${formatarMoeda(somaShopeeBruto)} | Líquido (Sem Taxas): R$ ${formatarMoeda(somaShopeeLiq)}`, 120, 64); doc.setFont(undefined, 'bold'); doc.text(`M. Livre:`, 190, 64); doc.setFont(undefined, 'normal'); doc.text(`Bruto: R$ ${formatarMoeda(somaMeliBruto)} | Líquido (Sem Taxas): R$ ${formatarMoeda(somaMeliLiq)}`, 205, 64); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text(`Devoluções: R$ ${formatarMoeda(totDevolvido)}`, 18, 72); doc.setTextColor(0, 0, 0);
    let currentY = 82, tableDataFilamentos = [], totaisMateriaisArray = Object.keys(usoFilamentos).map(k => ({ nome: k, peso: usoFilamentos[k] })); totaisMateriaisArray.sort((a, b) => b.peso - a.peso);
    totaisMateriaisArray.forEach(item => { tableDataFilamentos.push([ item.nome, formatarMoeda(item.peso) + "g", formatarMoeda(item.peso / 1000) + "kg" ]); });
    if (tableDataFilamentos.length > 0) { doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(249, 115, 22); doc.text("Consumo de Materiais (Itens Impressos)", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Material (Tipo / Cor / Marca)', 'Quantidade (Gramas)', 'Quantidade (Kilos)']], body: tableDataFilamentos, theme: 'grid', headStyles: { fillColor: [249, 115, 22] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15; }
    if (currentY > 150) { doc.addPage(); currentY = 20; } doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(59, 130, 246); doc.text("Histórico de Vendas", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Cliente', 'Projeto', 'Status', 'Canal', 'Valor Bruto', 'Valor Líquido', 'Tempo']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15;
    if (tableDataDevolucoes.length > 0) { if (currentY > 170) { doc.addPage(); currentY = 20; } doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text("Histórico de Devoluções", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Cliente', 'Projeto', 'Status', 'Canal', 'Valor Estornado', 'Lucro Nulo', 'Tempo']], body: tableDataDevolucoes, theme: 'grid', headStyles: { fillColor: [239, 68, 68] }, styles: { fontSize: 8 } }); currentY = doc.lastAutoTable.finalY + 15; }
    if (despFiltradas.length > 0) { const tableDataDespesas = despFiltradas.map(d => [ d.data, d.qtd + "x", d.nome, "R$ " + formatarMoeda(d.valor) ]); if (currentY > 170) { doc.addPage(); currentY = 20; } doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 68, 68); doc.text("Histórico de Despesas / Compras", 14, currentY); doc.autoTable({ startY: currentY + 5, head: [['Data', 'Qtd', 'Descrição', 'Valor Total']], body: tableDataDespesas, theme: 'grid', headStyles: { fillColor: [239, 68, 68] }, styles: { fontSize: 8 } }); }
    doc.save(`Relatorio_${diasFiltro}_Dias_3D4You.pdf`); showToast("📄 Relatório PDF Gerado!");
};

window.exportarExcel = function() {
    if (historico.length === 0 && estoque.length === 0 && catalogo.length === 0 && despesas.length === 0) { showToast("⚠️ Nenhum dado para exportar", true); return; }
    var pDias = prompt("Qual período deseja exportar no Excel?\n\nDigite: 30, 60, 90\nOu deixe em branco para exportar TODO O PERÍODO:", window.filtroDiasAtual === 'Total' ? '' : window.filtroDiasAtual); if (pDias === null) return; var diasFiltro = pDias.trim() === '' ? 'Total' : pDias.trim();
    var histFiltrado = historico.filter(h => isWithinDays(h.data || new Date().toLocaleDateString('pt-BR'), diasFiltro)); var despFiltradas = despesas.filter(d => isWithinDays(d.data || new Date().toLocaleDateString('pt-BR'), diasFiltro));
    var wb = XLSX.utils.book_new(), vendasValidas = histFiltrado.filter(h => h.status !== 'Devolução'), devolucoes = histFiltrado.filter(h => h.status === 'Devolução');
    if (vendasValidas.length > 0) { var dadosVendas = vendasValidas.map(h => ({ "Data": h.data, "Cliente": h.cliente || 'Balcão', "Projeto": h.nome, "Status": h.status, "Canal": h.canal, "Bruto (Com Taxas R$)": h.valorBruto !== undefined ? parseLocal(h.valorBruto) : (h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda)), "Líquido (Sem Taxas R$)": h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda), "Custo Fab (R$)": parseLocal(h.custo), "Log/Frete (R$)": parseLocal(h.frete || 0) + parseLocal(h.logistica || 0), "Lucro Real (R$)": (h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda)) - parseLocal(h.custo) - parseLocal(h.frete || 0) - parseLocal(h.logistica || 0), "Tempo (h)": parseLocal(h.tempo), "Peso (g)": parseLocal(h.peso) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosVendas), "Vendas"); }
    if (devolucoes.length > 0) { var dadosDevolucoes = devolucoes.map(h => ({ "Data": h.data, "Cliente": h.cliente || 'Balcão', "Projeto": h.nome, "Status": h.status, "Canal": h.canal, "Valor Estornado (R$)": h.valorLiquido !== undefined ? parseLocal(h.valorLiquido) : parseLocal(h.valorVenda), "Tempo Gasto (h)": parseLocal(h.tempo), "Peso Gasto (g)": parseLocal(h.peso) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosDevolucoes), "Devoluções"); }
    if (despFiltradas.length > 0) { var dadosDespesas = despFiltradas.map(d => ({ "Data": d.data, "Qtd": d.qtd, "Descrição": d.nome, "Valor (R$)": parseLocal(d.valor) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosDespesas), "Despesas"); }
    if (estoque.length > 0) { var dadosEstoque = estoque.map(e => ({ "Tipo": e.tipo, "Cor": e.cor, "Marca": e.marca, "Preço Pago (R$)": parseLocal(e.preco) })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosEstoque), "Estoque"); }
    if (catalogo.length > 0) { var dadosCatalogo = catalogo.map(c => ({ "Produto": c.nome, "Tempo (h)": parseLocal(c.tempo), "Peso Principal (g)": parseLocal(c.peso1), "Preço Fixo (R$)": c.precoFixo ? parseLocal(c.precoFixo) : "N/A" })); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosCatalogo), "Catálogo"); }
    XLSX.writeFile(wb, `Relatorio_${diasFiltro}_Dias_3D4You.xlsx`); showToast("📊 Excel Exportado com Sucesso!");
};

window.fazerBackupJSON = function() {
    var dadosCompletos = { historico: historico, estoque: estoque, catalogo: catalogo, despesas: despesas, configGlobais: window.configGlobais, qaOffset: window.qaOffset, migrado: true };
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dadosCompletos)), downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", "Backup_3D4You_Seguro.json"); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove(); showToast("📦 Backup descarregado com sucesso!");
};

window.importarBackupJSON = function(input) {
    var file = input.files[0]; if (!file) return; var reader = new FileReader();
    reader.onload = async function(e) { 
        try { 
            var dados = JSON.parse(e.target.result); 
            showToast("⏳ A restaurar base de dados... Aguarde!", false);
            if (dados.historico) for (let h of dados.historico) { await nuvemRef.collection('historico').doc(h.id.toString()).set(h); }
            if (dados.estoque) for (let es of dados.estoque) { await nuvemRef.collection('estoque').doc(es.id.toString()).set(es); }
            if (dados.catalogo) for (let c of dados.catalogo) { await nuvemRef.collection('catalogo').doc(c.id.toString()).set(c); }
            if (dados.despesas) for (let d of dados.despesas) { await nuvemRef.collection('despesas').doc(d.id.toString()).set(d); }
            if (dados.configGlobais) await nuvemRef.update({ configGlobais: dados.configGlobais, qaOffset: dados.qaOffset || 0, migrado: true });
            showToast("📥 Base de dados restaurada!"); setTimeout(() => location.reload(), 1500); 
        } catch (error) { showToast("❌ Erro ao ler o ficheiro .json", true); console.error(error); } 
    };
    reader.readAsText(file); input.value = ""; 
};

window.forcarRecalculoGeral = function() {
    if(!confirm("⚠️ ATENÇÃO: Isto vai atualizar APENAS OS CUSTOS DE EMBALAGEM E DESLOCAMENTO de todas as vendas para refletir os valores das configurações.\n\nO Valor da Venda (Grana recebida) ficará INTACTO! Deseja continuar?")) return;
    var emb = pegaValor('custoEmbalagem'), des = pegaValor('custoDeslocamento'); var cLogGlobal = emb + des; var corrigidos = 0;
    historico.forEach(h => {
        if (h.status === 'Orçamento' || h.status === 'Devolução') return;
        h.logistica = cLogGlobal; salvarNoFirebase('historico', h); corrigidos++;
    });
    showToast("✅ " + corrigidos + " custos logísticos atualizados!"); window.fecharModal('configModal');
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
