import crypto from 'node:crypto';
import type {
  CircuitCallResult,
  DeployResult,
  MidnightExecutionReadiness,
  MidnightNetworkConfig,
  TransactionStatus,
  ZKProof,
} from '../types/index.js';

type MidnightExecutionMode = 'strict' | 'simulation';

const REAL_EXECUTION_REQUIREMENTS = [
  'Compile the Compact contracts into deployable Midnight artifacts.',
  'Deploy the payroll contract and provide a real contract ID/address.',
  'Wire backend contract calls to the official Midnight SDK bindings.',
  'Configure a reachable Midnight proof server for proof generation and verification.',
];

function randomDelay(): Promise<void> {
  const delayMs = 50 + Math.floor(Math.random() * 150);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function simulatedTxId(): string {
  return `sim_${crypto.randomBytes(32).toString('hex')}`;
}

function simulatedContractId(): string {
  return `sim_contract_${crypto.randomBytes(16).toString('hex')}`;
}

export class MidnightConfigurationError extends Error {
  readonly statusCode = 503;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MidnightConfigurationError';
    this.details = details;
  }
}

export class MidnightService {
  private static instance: MidnightService | null = null;
  private connected = false;
  private config: MidnightNetworkConfig | null = null;
  private readonly mode: MidnightExecutionMode;

  private constructor() {
    const configuredMode = process.env.MIDNIGHT_EXECUTION_MODE?.trim().toLowerCase() ?? 'simulation';
    if (configuredMode !== 'strict' && configuredMode !== 'simulation') {
      throw new MidnightConfigurationError(
        `Invalid MIDNIGHT_EXECUTION_MODE "${configuredMode}". Use "simulation" or "strict".`,
      );
    }
    this.mode = configuredMode;
  }

  static getInstance(): MidnightService {
    if (!MidnightService.instance) {
      MidnightService.instance = new MidnightService();
    }
    return MidnightService.instance;
  }

  async connectToNetwork(config: MidnightNetworkConfig): Promise<void> {
    this.config = config;
    this.connected = false;

    console.log(`[Midnight] network=${config.network} mode=${this.mode}`);
    console.log(`[Midnight] indexer=${config.indexerUrl}`);
    console.log(`[Midnight] node=${config.nodeUrl}`);
    console.log(`[Midnight] proofServer=${config.proofServerUrl}`);

    if (this.mode === 'strict') {
      console.warn(
        '[Midnight] strict mode enabled. Real contract/proof integration must be configured before deposit or withdraw endpoints will execute.',
      );
      return;
    }

    await randomDelay();
    console.warn('[Midnight] simulation mode enabled. Transactions will be simulated, not submitted on-chain.');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getNetwork(): string {
    return this.config?.network ?? 'unknown';
  }

  getMode(): MidnightExecutionMode {
    return this.mode;
  }

  getExecutionReadiness(): MidnightExecutionReadiness {
    if (this.mode === 'simulation') {
      return {
        mode: this.mode,
        currentModeAllowsExecution: true,
        readyForRealTransactions: false,
        simulatedTransactions: true,
        message:
          'Simulation mode is enabled. Payroll execution and withdrawals will complete locally, but no real Midnight transactions will be submitted.',
        requirements: REAL_EXECUTION_REQUIREMENTS,
      };
    }

    return {
      mode: this.mode,
      currentModeAllowsExecution: false,
      readyForRealTransactions: false,
      simulatedTransactions: false,
      message:
        'Real Midnight execution is not configured yet. This project still needs compiled artifacts, a deployed contract, SDK bindings, and a proof service before on-chain execution can succeed.',
      requirements: REAL_EXECUTION_REQUIREMENTS,
    };
  }

  async deployContract(
    contractName: string,
    params: Record<string, unknown> = {},
  ): Promise<DeployResult> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real contract deployment is not wired yet for "${contractName}". Provide compiled Compact artifacts and SDK bindings before calling deployContract().`,
    );

    console.log(`[Midnight] Simulating deployment for ${contractName}`, params);
    await randomDelay();

    return {
      contractId: simulatedContractId(),
      txHash: simulatedTxId(),
      address: `sim_address_${crypto.randomBytes(20).toString('hex')}`,
      deployedAt: new Date().toISOString(),
    };
  }

  async callCircuit(
    contractId: string,
    circuitName: string,
    _privateInputs: Record<string, unknown>,
    publicInputs: Record<string, unknown>,
  ): Promise<CircuitCallResult> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real Midnight execution is not configured for ${contractId}.${circuitName}. Set MIDNIGHT_EXECUTION_MODE=simulation only if you explicitly want simulated transactions.`,
    );

    console.log(`[Midnight] Simulating ${contractId}.${circuitName}`);
    await randomDelay();

    return {
      txHash: simulatedTxId(),
      publicOutputs: { ...publicInputs, simulated: true },
      proof: crypto.randomBytes(128).toString('base64'),
      executedAt: new Date().toISOString(),
    };
  }

  async getPublicState(contractId: string, key: string): Promise<unknown> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real public state reads are not configured for ${contractId}.${key}.`,
    );

    await randomDelay();
    const mockValues: Record<string, unknown> = {
      totalDeposited: 150_000,
      employeeCount: 42,
      merkleRoot: `0x${crypto.randomBytes(32).toString('hex')}`,
      complianceStatus: 'passed',
    };
    return mockValues[key] ?? null;
  }

  async generateProof(
    circuitName: string,
    inputs: Record<string, unknown>,
  ): Promise<ZKProof> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real proof generation is not configured for circuit "${circuitName}". Attach the Compact proof pipeline before enabling claim execution.`,
    );

    await randomDelay();
    return {
      proof: crypto.randomBytes(256).toString('base64'),
      publicInputs: inputs,
      circuitName,
      generatedAt: new Date().toISOString(),
    };
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real proof verification is not configured for circuit "${proof.circuitName}".`,
    );

    await randomDelay();
    return proof.proof.length > 0;
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    this.assertConnected();
    this.assertSimulationMode(
      `Real transaction status polling is not configured for tx ${txHash}.`,
    );

    await randomDelay();
    return {
      txHash,
      status: 'confirmed',
      blockHeight: 1_000_000 + Math.floor(Math.random() * 10_000),
      confirmations: 6,
      timestamp: new Date().toISOString(),
    };
  }

  private assertConnected(): void {
    if (!this.config) {
      throw new MidnightConfigurationError(
        'Midnight execution is not configured. Call connectToNetwork() before invoking contract actions.',
      );
    }
  }

  private assertSimulationMode(message: string): void {
    if (this.mode !== 'simulation') {
      throw new MidnightConfigurationError(message, {
        executionReadiness: this.getExecutionReadiness(),
      });
    }
  }
}

export default MidnightService.getInstance();
