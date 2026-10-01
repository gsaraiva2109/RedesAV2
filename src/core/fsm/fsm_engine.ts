import { FSMDefinition, FSMTransition } from '../types';

export interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  action?: string;
  transition?: FSMTransition;
  error?: string;
}

/**
 * Motor Genérico de Máquina de Estados Finitos (FSM) dirigida por dados (Data-Driven).
 * Atende ao Requisito 4.1 do documento oficial:
 * - Não usa if/else espalhados para a lógica da FSM;
 * - Transições são carregadas de arquivo JSON estruturado como (estado, evento[condição]) -> (ação, novo_estado);
 * - Rejeita eventos inválidos para o estado atual com registro do motivo;
 * - Suporta carregamento de novas FSMs (ex: TCP, UDP, rdt 2.1) transparentemente.
 */
export class FSMEngine {
  private definition: FSMDefinition;
  private currentState: string;

  constructor(definition: FSMDefinition) {
    this.definition = definition;
    this.currentState = definition.initialState;
  }

  public getDefinition(): FSMDefinition {
    return this.definition;
  }

  public getCurrentState(): string {
    return this.currentState;
  }

  public reset(): void {
    this.currentState = this.definition.initialState;
  }

  public setState(stateId: string): void {
    const exists = this.definition.states.some((s) => s.id === stateId);
    if (!exists) {
      throw new Error(`Estado inválido: "${stateId}" não pertence à FSM ${this.definition.name}`);
    }
    this.currentState = stateId;
  }

  /**
   * Avalia e executa uma transição para o estado atual dado um evento e contexto de condições.
   */
  public trigger(
    event: string,
    conditionEvaluator?: (cond: string) => boolean,
  ): TransitionResult {
    const prevState = this.currentState;

    // Localiza todas as transições a partir do estado atual com o evento fornecido
    const possibleTransitions = this.definition.transitions.filter(
      (t) => t.from === prevState && t.event === event,
    );

    if (possibleTransitions.length === 0) {
      // Rejeição formal de evento ilegal
      const allowedEvents = Array.from(
        new Set(
          this.definition.transitions
            .filter((t) => t.from === prevState)
            .map((t) => t.event),
        ),
      );
      const reason = `[FSM ${this.definition.name}] Evento rejeitado: "${event}" não é válido no estado atual "${prevState}". Eventos aceitos neste estado: [${allowedEvents.join(', ') || 'NENHUM'}].`;

      return {
        success: false,
        previousState: prevState,
        newState: prevState,
        error: reason,
      };
    }

    // Avalia condições das transições candidatas
    let matchedTransition: FSMTransition | null = null;

    for (const trans of possibleTransitions) {
      if (!trans.condition) {
        matchedTransition = trans;
        break;
      }

      if (conditionEvaluator && conditionEvaluator(trans.condition)) {
        matchedTransition = trans;
        break;
      }
    }

    if (!matchedTransition) {
      const conds = possibleTransitions.map((t) => t.condition).join(', ');
      return {
        success: false,
        previousState: prevState,
        newState: prevState,
        error: `[FSM ${this.definition.name}] Evento "${event}" disparado no estado "${prevState}", mas nenhuma condição satisfeita (${conds}).`,
      };
    }

    // Transição autorizada
    this.currentState = matchedTransition.to;

    return {
      success: true,
      previousState: prevState,
      newState: this.currentState,
      action: matchedTransition.action,
      transition: matchedTransition,
    };
  }
}
