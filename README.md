# Simulador de FSMs de UDP e TCP

Projeto prático da disciplina **Redes Convergentes** (Unidade 2 - Atividade Avaliativa 2) da Universidade de Fortaleza (UNIFOR).

Este projeto é um simulador desacoplado e determinístico com interface gráfica interativa para visualização, teste e execução das Máquinas de Estados Finitos (FSMs) dos protocolos **TCP** (RFC 793, figuras 3.41 e 3.42 do Kurose & Ross) e **UDP** (RFC 768), além de extensibilidade demonstrada para FSMs didáticas como **rdt 2.1**.

---

## 1. Destaques da Implementação

1. **Motor Genérico de FSM Dirigido por Dados (Requisito 4.1):**
   - Transições declaradas formalmente em arquivos JSON (`fsms/tcp.json`, `fsms/udp.json`, `fsms/rdt21.json`).
   - Tupla estruturada: `(estado, evento[condição]) -> (ação, novo_estado)`.
   - Rejeição formal de eventos inválidos para o estado atual com registro do motivo.

2. **Núcleo Independente da Interface Gráfica (Requisitos 3 e 5):**
   - Arquitetura estritamente desacoplada (MVC).
   - Simulação por Eventos Discretos (DES) com **Relógio Virtual** (`virtual_clock.ts`), permitindo que a suíte com todos os testes automatizados execute em **~180ms**.
   - Gerador pseudo-aleatório determinístico (`prng.ts`) baseado em semente (*seed*) para 100% de reprodutibilidade de falhas.

3. **Protocolos Fidedignos:**
   - **UDP:** cálculo real de checksum de 16 bits em complemento de 1 (RFC 1071 / Kurose 3.3) e descarte silencioso em corrupção.
   - **TCP:** todos os 11 estados de conexão; handshake de 3 vias; encerramento de 4 vias (incluindo fechamento simultâneo `CLOSING`); timer `TIME_WAIT` (2×MSL); envio de `RST` em porta fechada; numeração real de sequência e ACK cumulativo; estimativa dinâmica de RTT (RFC 6298 com `EstimatedRTT`, `DevRTT` e `TimeoutInterval`); e **Retransmissão Rápida (*Fast Retransmit*)** após 3 ACKs duplicados.

4. **Canal com Imperfeições Simuladas (Requisito 4.5):**
   - Sliders de probabilidade de perda (%), atraso mín/máx (ms), corrupção de bits (%), duplicação e reordenação.
   - Botão para **descartar manualmente** o próximo segmento com 1 clique.

5. **Interface Gráfica Completa (Requisito 4.6):**
   - **Diagrama de Sequência (*Ladder Diagram*):** eixos verticais no tempo, setas rotuladas, pacotes perdidos visualmente cortados/interrompidos com ícone de descarte e retransmissões destacadas em cor âmbar.
   - **Diagrama de Estados (FSM Graph):** visualização do grafo de estados com nós e arestas em SVG, destaque ativo com efeito luminoso para Host A e Host B, e faixa informativa da última transição `(evento / ação)`.
   - **Controles de Playback:** Iniciar, Pausar, Passo a Passo (Step), controle de velocidade (0.5x, 1x, 2x, 5x) e Reset.
   - **Seletor de Cenários Oficiais (1 a 10):** carregamento e execução com 1 clique para demonstrações ao vivo.
   - **Tabela de Logs Filtrável:** busca textual, filtro por host e botão de exportação CSV para o relatório.
   - **Modo Lado a Lado (Cenário 10):** execução comparativa simultânea de UDP vs TCP sob a mesma carga e ruído.

---

## 2. Tecnologias Utilizadas

- **Linguagem:** TypeScript (tipagem estrita de pacotes, flags, eventos e estados)
- **Frontend / Interface:** React 19, Vite, Tailwind CSS v4, Lucide Icons, SVG Nativo
- **Núcleo de Rede (Core):** TypeScript puro (sem dependências de DOM / executável em Node.js)
- **Testes Automatizados:** Vitest

---

## 3. Instruções de Instalação e Execução

### Pré-requisitos
- Node.js (versão 18+ recomendada)
- npm

### Instalação
```bash
git clone <url-do-repositorio>
cd RedesAV2
npm install
```

### Execução da Interface Gráfica (GUI)
```bash
npm run dev
```
Abra o navegador no endereço exibido (geralmente `http://localhost:5173`).

### Execução dos Testes Automatizados (Modo Headless)
```bash
npm test
```
Executa diretamente pelo terminal a validação dos 10 cenários obrigatórios em milissegundos sem abrir o navegador.

### Compilação de Produção
```bash
npm run build
```

---

## 4. Cobertura dos 10 Cenários de Testes Obrigatórios

| # | Protocolo | Cenário | Validação Automatizada |
|---|---|---|---|
| **1** | TCP | Handshake sem falhas | A: `CLOSED -> SYN_SENT -> ESTABLISHED`; B: `LISTEN -> SYN_RCVD -> ESTABLISHED`. |
| **2** | TCP | Perda do SYN | Timeout no relógio virtual e retransmissão do SYN mantendo número de sequência. |
| **3** | TCP | Perda do SYN-ACK | Cliente retransmite SYN; servidor reenvia SYN-ACK; conexão estabelece. |
| **4** | TCP | Encerramento normal | A: `FIN_WAIT_1 -> FIN_WAIT_2 -> TIME_WAIT`; B: `CLOSE_WAIT -> LAST_ACK -> CLOSED`. |
| **5** | TCP | Fechamento simultâneo | Ambos os hosts em `ESTABLISHED` enviam FIN e transitam: `FIN_WAIT_1 -> CLOSING -> TIME_WAIT -> CLOSED`. |
| **6** | TCP | Perda de dado & Fast Retransmit | 10 segmentos enviados, 3º perdido. Receptor envia 3 ACKs duplicados; remetente retransmite **imediatamente antes do timeout de RTT**. |
| **7** | TCP | Conexão a porta fechada | Host B em `CLOSED` recebe tentativa de conexão e responde com flag `RST`. |
| **8** | UDP | 20 datagramas com 30% de perda | Datagramas perdidos não sofrem nenhuma retransmissão; aplicação recebe apenas os íntegros. |
| **9** | UDP | Checksum corrompido | Receptor detecta soma de 16 bits inválida e descarta silenciosamente. |
| **10** | UDP vs TCP | Mesma carga, mesmo canal ruidoso | Relatório comparativo com entregues, perdidos, retransmissões e tempo virtual total. |

---

## 5. Respostas para o Relatório Técnico (Seção 9)

### Pergunta 1: Por que o estado TIME_WAIT existe, e o que acontece se ele for removido no cenário 4?
> **Resposta:**
> O estado `TIME_WAIT` (cuja duração padrão na RFC 793 é de 2×MSL - *Maximum Segment Lifetime*) existe por duas razões essenciais:
> 1. **Garantir a entrega confiável do último ACK:** Se o ACK enviado pelo host que iniciou o encerramento ativo for perdido no canal, o outro host (que está em `LAST_ACK`) terá um estouro de temporizador e retransmitirá o seu FIN. Se o host inicial já tivesse ido direto para `CLOSED` sem passar por `TIME_WAIT`, ele não reconheceria a conexão e responderia com um `RST`, deixando o peer em estado de encerramento anômalo/abrupto.
> 2. **Prevenir que segmentos antigos "fantasmas" interfiram em novas conexões:** O intervalo 2×MSL garante que todos os segmentos pertencentes a essa conexão expirem na rede antes que o mesmo par de portas `(IP_origem, Porta_origem, IP_destino, Porta_destino)` possa ser reutilizado.
>
> *No Cenário 4:* Se o `TIME_WAIT` fosse removido e o ACK final do Host A sofresse perda no canal, o Host B ficaria eternamente bloqueado em `LAST_ACK` (ou geraria erro de conexão abortada ao retransmitir seu FIN e receber um RST).

### Pergunta 2: Por que o UDP não precisa de FSM de conexão e quais responsabilidades sobram para a aplicação?
> **Resposta:**
> O UDP é inerentemente **não orientado a conexão** e stateless. Não há fase de estabelecimento de estado compartilhado (como buffers de envio/recepção, controle de sequência inicial ou janelas deslizantes) entre os terminais antes do tráfego. Por isso, sua FSM é de estado único (`OPEN`), limitando-se a empacotar o datagrama com as portas, o comprimento e o checksum de 16 bits.
>
> **Responsabilidades repassadas para a camada de aplicação:**
> - Controle de fluxo e ritmo de transmissão.
> - Detecção e retransmissão de perdas (se confiabilidade for desejada).
> - Ordenação de dados recebidos fora de ordem.
> - Controle de congestionamento para não colapsar a rede.

### Pergunta 3: No cenário 6, quanto tempo a retransmissão rápida economizou em relação ao timeout?
> **Resposta:**
> No Cenário 6, o temporizador de retransmissão baseado na RFC 6298 calcula o `TimeoutInterval = EstimatedRTT + 4 * DevRTT` (tipicamente ajustado em torno de centenas de milissegundos, por exemplo, 400ms na simulação).
> A Retransmissão Rápida (*Fast Retransmit*) dispara imediatamente após a chegada do **3º ACK duplicado**, o que ocorre logo após o tempo de viagem de ida e volta (1 RTT) dos segmentos seguintes que já estavam em trânsito.
> Na nossa simulação virtual, os 3 ACKs duplicados chegaram em **~80ms**, enquanto o estouro de temporizador demoraria **400ms**. A economia líquida de tempo foi de aproximadamente **320ms** (ou cerca de 75% a 80% do tempo de espera), evitando a ociosidade do pipeline do transmissor.

### Pergunta 4: Quais transições do diagrama do livro foram mais difíceis de reproduzir e por quê?
> **Resposta:**
> 1. **Fechamento Simultâneo (`FIN_WAIT_1 -> CLOSING -> TIME_WAIT`):** Distinguir quando um pacote com a flag `FIN` ativada é apenas um encerramento concorrente (em que o peer ainda não viu o nosso FIN, possuindo `ACK < nextSeqNum`) de um encerramento onde o FIN e o ACK do nosso próprio FIN chegam juntos no mesmo segmento (`FIN_WAIT_1 -> TIME_WAIT`).
> 2. **Tratamento de porta fechada com `RST`:** Garantir que qualquer segmento recebido quando a FSM local está em `CLOSED` retorne deterministicamente um `RST` com o número de sequência e ACK corretos para derrubar a tentativa de conexão do peer de volta ao estado inicial.
