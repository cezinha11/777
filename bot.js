const venom = require('venom-bot');
const QRCode = require('qrcode');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const COMMON_USER_AGENTS_SET2 = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgentSet2() {
    return COMMON_USER_AGENTS_SET2[Math.floor(Math.random() * COMMON_USER_AGENTS_SET2.length)];
}

const proxies = [
    { server: 'proxyhost', username: 'youruser', password: 'yourpass' },
    { server: 'proxyhost', username: 'youruser', password: 'yourpass' }
];

const contasConfig = [
    { id: 1, perfilChrome: 'C:\\perfil_chrome_conta1', userAgent: getRandomUserAgentSet2(), proxy: proxies[0] },
    { id: 2, perfilChrome: 'C:\\perfil_chrome_conta2', userAgent: getRandomUserAgentSet2(), proxy: proxies[1] }
];

const usedUAsSet2 = new Set();
contasConfig.forEach(config => {
    let ua = getRandomUserAgentSet2();
    if (COMMON_USER_AGENTS_SET2.length > contasConfig.length) {
        while(usedUAsSet2.has(ua)) {
            ua = getRandomUserAgentSet2();
        }
    }
    config.userAgent = ua;
    usedUAsSet2.add(ua);
});

const targetUrl = 'https://777bit10.vip/promotion/redeem';
const monitoredChannel = '120363272808166536@newsletter';
const regex = /➡️\s*([\d\s]+?)\s*⬅️/g;

async function sleep(ms, addRandomness = true) {
    if (addRandomness && ms > 0) {
        const variation = ms * 0.15;
        const randomMs = ms - variation / 2 + Math.random() * variation;
        return new Promise(resolve => setTimeout(resolve, Math.max(5, randomMs)));
    }
    return new Promise(resolve => setTimeout(resolve, Math.max(5, ms)));
}

async function retry(fn, retries = 2, delayMs = 1000, taskName = "tarefa") {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            console.error(`[RETRY-${taskName}] Tentativa ${i + 1}/${retries} falhou: ${error.message.split('\n')[0]}`);
            if (i < retries - 1) {
                await sleep(delayMs, false);
            }
        }
    }
    throw new Error(`[RETRY-${taskName}] Todas as tentativas falharam.`);
}

async function resgatarCodigo(codigo, page, contaId) {
    try {
        const inputSelector = 'input[placeholder="Por favor preencha o código"]';
        await page.waitForSelector(inputSelector, { timeout: 10000, visible: true });
        
        await page.click(inputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        
        await page.type(inputSelector, codigo, { delay: Math.random() * 10 + 20 });

        const botaoResgatarXPath = "//*[text()='Resgatar']";
        await page.waitForSelector('xpath/' + botaoResgatarXPath, { timeout: 3000, visible: true });

        await page.evaluate((xpath) => {
            const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (element) element.click();
            else throw new Error(`Elemento com XPath "${xpath}" não foi encontrado.`);
        }, botaoResgatarXPath);

        console.log(`[CONTA ${contaId}] Código ${codigo} tentativa enviada com sucesso.`);
        
        await sleep(1500, false);
        
        const successPath = `./success_screenshots`;
        if (!fs.existsSync(successPath)) fs.mkdirSync(successPath, {recursive: true});
        const screenshotPath = `${successPath}/SUCESSO_C${contaId}_CODE_${codigo}_${Date.now()}.png`;
        if (!page.isClosed()) {
            await page.screenshot({ path: screenshotPath });
            console.log(`[CONTA ${contaId}] Screenshot de sucesso salvo em: ${screenshotPath}`);
        }
    } catch (error) {
        console.error(`[CONTA ${contaId}] ERRO NO RESGATE ${codigo}: ${error.message.split('\n')[0].substring(0,120)}`);
        
        const errorPath = `./error_screenshots`;
        if (!fs.existsSync(errorPath)) fs.mkdirSync(errorPath, {recursive: true});
        const screenshotPath = `${errorPath}/ERRO_C${contaId}_${Date.now()}.png`;
        try {
            if (!page.isClosed()) {
                await page.screenshot({ path: screenshotPath });
                console.log(`[CONTA ${contaId}] Screenshot de erro salvo em: ${screenshotPath}`);
            }
        } catch (screenshotError) {
            console.error(`[CONTA ${contaId}] Falha ao tirar screenshot de erro.`);
        }
        
        throw error;
    } finally {
        if (!page.isClosed()) {
            await sleep(5000, false); 
            try {
                await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
            } catch (reloadError) {
                console.error(`[CONTA ${contaId}] ERRO AO RECARREGAR PÁGINA DE RESGATE: ${reloadError.message.split('\n')[0]}`);
            }
        }
    }
}

async function iniciarNavegadores() {
    const navegadores = [];
    const chromeExecutablePath = 'C:\\chromium\\chrome-win\\chrome.exe';

    for (const config of contasConfig) {
        if (!config.proxy || typeof config.proxy.server === 'undefined') {
            console.error(`[ERRO DE CONFIGURAÇÃO] Proxy não definido para conta ID: ${config.id}. Pulando.`);
            continue; 
        }

        console.log(`\n[CONTA ${config.id}] Iniciando navegador com proxy: ${config.proxy.server}...`);
        if (!fs.existsSync(config.perfilChrome)) {
            fs.mkdirSync(config.perfilChrome, { recursive: true });
        }

        let browserInstance;
        try {
            browserInstance = await puppeteer.launch({
                executablePath: chromeExecutablePath,
                headless: 'new',
                userDataDir: config.perfilChrome,
                args: [
                    '--no-sandbox',
                    '--profile-directory=Default',
                    `--proxy-server=${config.proxy.server}`,
                    '--process-per-site',
                    '--disable-gpu',
                    '--disable-accelerated-2d-canvas',
                    '--no-zygote',
                    '--in-process-gpu',
                    '--disable-features=AudioServiceOutOfProcess',
                    '--disable-ipc-flooding-protection',
                    '--disable-notifications',
                    '--disable-desktop-notifications',
                    '--disable-speech-api',
                    '--disable-extensions',
                    '--disable-blink-features=AutomationControlled',
                    `--window-size=1024,768`,
                    '--disable-infobars',
                    '--mute-audio',
                    '--no-first-run'
                ]
            });

            const initialPages = await browserInstance.pages();
            if (initialPages.length > 0) {
                await initialPages[0].close();
            }

            const page = await browserInstance.newPage();

            // =========================================================================
            // MODIFICADO: 'stylesheet' foi removido da lista de bloqueio
            // =========================================================================
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'font'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            // =========================================================================

            if (config.proxy.username && typeof config.proxy.password !== 'undefined') {
                await page.authenticate({ username: config.proxy.username, password: config.proxy.password });
            }
            await page.setUserAgent(config.userAgent);
            
            console.log(`[CONTA ${config.id}] Verificando IP (via proxy ${config.proxy.server})...`);
            await retry(async () => {
                await page.goto('https://api.ipify.org?format=json', { waitUntil: 'domcontentloaded', timeout: 15000 });
            }, 2, 1500, `VerificaIP-C${config.id}`);
            const ipInfo = await page.evaluate(() => document.body.innerText).catch(() => "IP não obtido");
            console.log(`[CONTA ${config.id}] IP: ${ipInfo}`);

            console.log(`[CONTA ${config.id}] Carregando página de resgate: ${targetUrl}`);
            await retry(async () => {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            }, 2, 2000, `CarregaSite-C${config.id}`);

            console.log(`[CONTA ${config.id}] Navegador pronto na página de resgate!`);
            navegadores.push({ id: config.id, page, browser: browserInstance });

            console.log(`[SISTEMA] Aguardando 3 segundos antes de iniciar o próximo navegador...`);
            await sleep(3000, false);

        } catch (error) {
            console.error(`[CONTA ${config.id}] FALHA INICIALIZAÇÃO com proxy ${config.proxy.server}: ${error.message.split('\n')[0]}`);
            if (browserInstance) {
                await browserInstance.close().catch(e => { /* ignore */ });
            }
            console.log(`[SISTEMA] Aguardando 3 segundos após falha...`);
            await sleep(3000, false);
        }
    }
    return navegadores;
}

async function connectWhatsApp(navegadoresParaResgate) {
    console.log('[WHATSAPP - VENOM] Iniciando conexão...');
    try {
        const client = await venom.create(
            'minha-sessao-whatsapp',
            (base64Qr, asciiQR) => {
                console.log('[WHATSAPP - VENOM] QR Code ASCII:\n', asciiQR);
                const qrImagePath = './qrcode_venom.png';
                const base64Data = base64Qr.replace(/^data:image\/png;base64,/, "");
                fs.writeFile(qrImagePath, base64Data, 'base64', function(err) {
                    if (err) console.error('[WHATSAPP - VENOM] Erro ao salvar QR Code:', err);
                    else console.log(`[WHATSAPP - VENOM] QR Code salvo em ${qrImagePath}.`);
                });
            },
            (statusSession) => {
                console.log('[WHATSAPP - VENOM] Status da sessão:', statusSession);
                if (['isLogged', 'qrReadSuccess', 'chatsAvailable'].includes(statusSession)) {
                    console.log('[WHATSAPP - VENOM] Conexão WhatsApp ATIVA!');
                }
                if (['notLogged', 'deviceNotConnected', 'serverClose', 'deleteToken', 'browserClose'].includes(statusSession)) {
                    console.error(`[WHATSAPP - VENOM] Conexão CERRADA: ${statusSession}.`);
                }
            },
            { headless: 'new', devtools: false, autoClose: 0, logQR: false }
        );
        console.log('[WHATSAPP - VENOM] Cliente criado. Configurando listeners...');
        startVenomListeners(client, navegadoresParaResgate);
        return client;
    } catch (error) {
        console.error('[WHATSAPP - VENOM] Erro CRÍTICO ao criar cliente:', error);
        await sleep(15000, false);
        return connectWhatsApp(navegadoresParaResgate);
    }
}

function startVenomListeners(client, navegadores) {
    client.onMessage(async (message) => {
        if (message.chatId !== monitoredChannel || message.fromMe) return;
        
        const messageText = message.caption || message.body || '';
        if (!messageText.trim()) return;

        const matches = [...messageText.matchAll(regex)];
        if (matches.length === 0) return;

        for (const match of matches) {
            const codigo = match[1].replace(/\s/g, '').trim(); 
            if (!codigo) continue; 

            console.log(`\n[CÓDIGO DETECTADO] ${codigo}. Disparando resgate para todas as contas...`);

            const rescuePromises = navegadores.map(navegador => 
                retry(() => resgatarCodigo(codigo, navegador.page, navegador.id), 1, 500, `Resg-C${navegador.id}`)
            );

            await Promise.allSettled(rescuePromises);

            console.log(`[SISTEMA] Ciclo de resgate para o código ${codigo} concluído.\n`);
        }
    });

    client.onStateChange((state) => {
        console.log('[WHATSAPP - VENOM] Estado da conexão principal mudou:', state);
        if (['CONFLICT', 'UNLAUNCHED', 'UNPAIRED', 'DISCONNECTED'].includes(state)) {
            console.error(`[WHATSAPP - VENOM] Estado problemático: ${state}.`);
        }
    });
    
    console.log('[WHATSAPP - VENOM] Listeners configurados.');
}

async function cleanupBrowsers(navegadores) {
    console.log("[SYSTEM] Encerrando navegadores...");
    for (const nav of navegadores) {
        if (nav.browser && nav.browser.isConnected()) { 
            try {
                await nav.browser.close();
                console.log(`[CONTA ${nav.id}] Navegador encerrado.`);
            } catch (e) { /* ignore */ }
        }
    }
    navegadores.length = 0; 
}

async function main() {
    let navegadores = [];
    let whatsappClient;
    let shuttingDown = false;

    const gracefulShutdown = async (signal = 'UNKNOWN') => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[SYSTEM] Sinal ${signal}. Desligando...`);

        if (whatsappClient) {
            console.log("[WHATSAPP - VENOM] Encerrando cliente Venom...");
            try {
                await whatsappClient.close();
            } catch (e) { console.error("[WHATSAPP - VENOM] Erro ao fechar cliente:", e) }
        }
        await cleanupBrowsers(navegadores);
        console.log("[SYSTEM] Desligamento concluído.");
        setTimeout(() => process.exit(signal.startsWith('SIG') ? 0 : 1), 500);
    };

    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => gracefulShutdown(signal));
    });
    process.on('uncaughtException', async (error, origin) => {
        console.error(`[SYSTEM] Uncaught Exception ${origin}:`, error);
        await gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', async (reason, promise) => {
        console.error('[SYSTEM] Unhandled Rejection:', reason);
    });

    try {
        navegadores = await iniciarNavegadores();
        if (navegadores.length === 0) {
            console.error("[SYSTEM] NENHUM NAVEGADOR INICIADO. ENCERRANDO.");
            process.exit(1);
        }
        whatsappClient = await connectWhatsApp(navegadores);
        console.log("[SYSTEM - VENOM] BOT DE RESGATE INICIADO. AGUARDANDO CÓDIGOS...");

    } catch (error) {
        console.error("[SYSTEM] ERRO CRÍTICO INICIAL:", error);
        await gracefulShutdown('mainError');
    }
}

main();
