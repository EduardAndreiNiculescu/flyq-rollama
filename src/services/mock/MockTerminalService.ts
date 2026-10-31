import poisJson from '../../data/pois.json';
import terminalJson from '../../data/terminal.json';
import type { Poi, Terminal } from '../../types';
import type { TerminalService } from '../types';

export class MockTerminalService implements TerminalService {
  getTerminal(): Terminal {
    return terminalJson as Terminal;
  }

  getPois(): Poi[] {
    return poisJson as Poi[];
  }
}
