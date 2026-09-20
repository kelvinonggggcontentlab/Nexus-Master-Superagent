import { AdapterBundle, ExecutionMode } from './types';
import { createSimulationAdapters } from './simulation';
import { createProductionAdapters, setActiveBearerToken } from './production';

let currentMode: ExecutionMode = (process.env.NEXUS_EXECUTION_MODE as ExecutionMode) || 'simulation';
let simulationAdapters = createSimulationAdapters();
let productionAdapters = createProductionAdapters();

export function getAdapters(): AdapterBundle {
  return currentMode === 'production' ? productionAdapters : simulationAdapters;
}

export function setExecutionMode(mode: ExecutionMode): AdapterBundle {
  currentMode = mode;
  return getAdapters();
}

export function getExecutionMode(): ExecutionMode {
  return currentMode;
}

export function resetAdapters(): void {
  simulationAdapters = createSimulationAdapters();
  productionAdapters = createProductionAdapters();
}

export { setActiveBearerToken };
export * from './types';
export * from './simulation';
export * from './production';
