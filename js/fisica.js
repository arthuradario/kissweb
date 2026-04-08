/* ══════════════════════════════════════════════════════════
   fisica.js — Versão Corrigida (Massa, Atração e Gravidade Ponderada)
══════════════════════════════════════════════════════════ */

class PhysicsEngine {
    constructor() {
        this.enabled = false;
        // Ajuste fino das forças (baseado no seu teste original)
        this.repulsionStrength = 500000; 
        this.attractionStrength = 0.1;
        this.gravityStrength = 0.02;
        this.damping = 0.2; 
        this.maxSpeed = 60;

    }

    update() {
        if (!this.enabled) return;

        const w = cw(); 
        if (!w || !w.people || w.people.length === 0) return;

        // 1. CÁLCULO DE GRAU (CONEXÕES) E RESET DE FORÇAS
        const degree = {};
        w.connections.forEach(c => {
            degree[c.a] = (degree[c.a] || 0) + 1;
            degree[c.b] = (degree[c.b] || 0) + 1;
        });

        w.people.forEach(p => {
            p.fx = 0; p.fy = 0;
            p.vx = p.vx || 0; p.vy = p.vy || 0;
            // Define a massa baseada nas conexões (conforme seu teste original)
            p.mass = Math.max(1, degree[p.id] || 0);
        });

        // 2. REPULSÃO (Todos contra todos)
        for (let i = 0; i < w.people.length; i++) {
            for (let j = i + 1; j < w.people.length; j++) {
                const nodeA = w.people[i];
                const nodeB = w.people[j];
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distSq = dx * dx + dy * dy + 1;
                const dist = Math.sqrt(distSq);

                // Força inversamente proporcional ao quadrado da distância
                const force = this.repulsionStrength / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                nodeA.fx -= fx; nodeA.fy -= fy;
                nodeB.fx += fx; nodeB.fy += fy;
            }
        }

        // 3. ATRAÇÃO (Apenas quem tem conexão - Força de Mola)
        w.connections.forEach(link => {
            const nodeA = w.people.find(p => p.id === link.a);
            const nodeB = w.people.find(p => p.id === link.b);
            if (!nodeA || !nodeB) return;

            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

            // Atração linear (conforme seu teste: attraction * dist)
            const force = this.attractionStrength * dist ;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            nodeA.fx += fx; nodeA.fy += fy;
            nodeB.fx -= fx; nodeB.fy -= fy;
        });

        // 4. GRAVIDADE AO CENTRO (Ponderada pela Massa)
        // Isso faz com que as pessoas com mais conexões fiquem no centro
        const centerX = (wrap.clientWidth / 2 - vx) / vscale;
        const centerY = (wrap.clientHeight / 2 - vy) / vscale;

        w.people.forEach(node => {
            const dx = centerX - node.x;
            const dy = centerY - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                // Força de gravidade puxa mais forte quem tem mais massa
                const force = this.gravityStrength * dist * node.mass;
                node.fx += (dx / dist) * force;
                node.fy += (dy / dist) * force;
            }
        });

        // 5. ATUALIZAR POSIÇÕES (Considerando a Inércia/Massa)
        w.people.forEach(node => {
            // Se estiver sendo editado ou arrastado, não aplica física
            //if (node.id === selectedPersonId || node.fixed) return;

            // Aceleração = Força / Massa
            node.vx = (node.vx + node.fx / node.mass) * this.damping;
            node.vy = (node.vy + node.fy / node.mass) * this.damping;

            // Limitador de velocidade máxima
            const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
            if (speed > this.maxSpeed) {
                node.vx = (node.vx / speed) * this.maxSpeed;
                node.vy = (node.vy / speed) * this.maxSpeed;
            }

            node.x += node.vx;
            node.y += node.vy;
        });

        // 6. SINCRONIZAÇÃO COM O SITE
        render(); // Move as Divs
        renderLines(w); // Desenha as conexões SVG
    }

    shuffleLayout() {
    const w = cw();
    if (!w || !w.people) return;

    // Calculamos o centro atual da visualização
    const centerX = (wrap.clientWidth / 2 - vx) / vscale;
    const centerY = (wrap.clientHeight / 2 - vy) / vscale;
    
    // Define um raio de espalhamento baseado no número de pessoas
    const range = Math.sqrt(w.people.length) * 150; 

    w.people.forEach(p => {
        // 1. Gera posição aleatória ao redor do centro
        p.x = centerX + (Math.random() - 0.5) * range;
        p.y = centerY + (Math.random() - 0.5) * range;

        // 2. Zera as velocidades para não saírem voando
        p.vx = 0;
        p.vy = 0;

        // 3. Solta quem estava fixo (opcional, para a reorganização ser total)
        p.fixed = false;
    });

    // 4. Se a física estiver desligada, liga ela por um momento ou 
    // apenas renderiza a nova posição
    render();
    renderLines(w);
    
    showToast('teia reorganizada');
}

}

// Instancia e inicia o loop
const engine = new PhysicsEngine();

function physicsLoop() {
    engine.update();
    requestAnimationFrame(physicsLoop);
}
physicsLoop();

/* ══════════════════════════════════════════════════════════
   CONTROLES DE INTERFACE (Botões)
══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const btnPhysics = document.getElementById('btn-physics');
    const btnShuffle = document.getElementById('btn-shuffle');

    // 1. Configuração Inicial: Garante que o shuffle comece escondido se a física estiver off
    if (btnShuffle) {
        btnShuffle.style.display = engine.enabled ? 'flex' : 'none';
    }

    // 2. Lógica do Botão de Física
    if (btnPhysics) {
        btnPhysics.onclick = () => {
            engine.enabled = !engine.enabled;
            
            // Feedback visual do botão
            btnPhysics.classList.toggle('active');
            btnPhysics.style.backgroundColor = engine.enabled ? 'var(--accent)' : '';
            btnPhysics.style.color = engine.enabled ? 'white' : '';

            // Mostrar/Esconder o botão de shuffle
            if (btnShuffle) {
                btnShuffle.style.display = engine.enabled ? 'flex' : 'none';
            }
            
            showToast(engine.enabled ? 'física ativada' : 'física desativada');
        };
    }

    // 3. Lógica do Botão de Shuffle (Atribuído uma única vez aqui fora)
    if (btnShuffle) {
        btnShuffle.onclick = () => {
            // Verifica se a função existe antes de chamar
            if (typeof engine.shuffleLayout === 'function') {
                engine.shuffleLayout();
            } else {
                console.error("A função shuffleLayout não foi encontrada na classe PhysicsEngine.");
            }
        };
    }
});