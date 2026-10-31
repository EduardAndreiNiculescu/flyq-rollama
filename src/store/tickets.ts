import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardingPass, Ticket } from '../types';
import { zustandStorage } from './storage';

interface TicketsState {
  tickets: Ticket[];
  activeTicketId: string | null;
  /** Pașii din Călătorie marcați ca făcuți, per bilet */
  completedSteps: Record<string, string[]>;
  hydrated: boolean;
  addTicket: (pass: BoardingPass, flightId: string, isDemo: boolean) => Ticket;
  setActive: (id: string) => void;
  completeStep: (ticketId: string, stepId: string) => void;
  resetSteps: (ticketId: string) => void;
  clearAll: () => void;
}

export const useTickets = create<TicketsState>()(
  persist(
    (set, get) => ({
      tickets: [],
      activeTicketId: null,
      completedSteps: {},
      hydrated: false,
      addTicket: (pass, flightId, isDemo) => {
        const existing = get().tickets.find(t => t.pass.raw === pass.raw);
        if (existing) {
          set({ activeTicketId: existing.id });
          return existing;
        }
        const ticket: Ticket = {
          id: `${flightId}-${pass.seat}-${Date.now()}`,
          pass,
          flightId,
          // Grupa de îmbarcare nu e în BCBP; o derivăm din rând ca la majoritatea companiilor low-cost
          boardingGroup: Number.parseInt(pass.seat, 10) <= 10 ? 1 : 2,
          checkedInOnline: true,
          hasCheckedBag: false,
          isDemo,
          addedAt: new Date().toISOString(),
        };
        // Primul pas („Ajungi la aeroport”) e bifat: utilizatorul e deja aici când adaugă biletul
        set(state => ({
          tickets: [...state.tickets, ticket],
          activeTicketId: ticket.id,
          completedSteps: { ...state.completedSteps, [ticket.id]: ['arrive'] },
        }));
        return ticket;
      },
      setActive: id => set({ activeTicketId: id }),
      completeStep: (ticketId, stepId) =>
        set(state => {
          const done = state.completedSteps[ticketId] ?? [];
          if (done.includes(stepId)) return state;
          return { completedSteps: { ...state.completedSteps, [ticketId]: [...done, stepId] } };
        }),
      resetSteps: ticketId =>
        set(state => ({ completedSteps: { ...state.completedSteps, [ticketId]: ['arrive'] } })),
      clearAll: () => set({ tickets: [], activeTicketId: null, completedSteps: {} }),
    }),
    {
      name: 'tickets',
      storage: zustandStorage,
      partialize: ({ tickets, activeTicketId, completedSteps }) => ({ tickets, activeTicketId, completedSteps }),
      onRehydrateStorage: () => () => useTickets.setState({ hydrated: true }),
    },
  ),
);

export function useActiveTicket(): Ticket | null {
  return useTickets(state => state.tickets.find(t => t.id === state.activeTicketId) ?? null);
}
