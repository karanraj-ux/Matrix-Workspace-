import React from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import { CalendarEvent } from '../types';

interface CalendarViewProps {
  activeAccountIds: Set<string>;
  isLoadingStreams: boolean;
  filteredEvents: CalendarEvent[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  activeAccountIds,
  isLoadingStreams,
  filteredEvents
}) => {
  return (
    <div className="absolute inset-0 bg-neutral-50 flex-col overflow-y-auto flex">
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 leading-tight">Master Agenda</h2>
              <p className="text-sm text-neutral-500">Upcoming events across all connected accounts.</p>
            </div>
          </div>
          {isLoadingStreams && <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />}
        </div>

        {activeAccountIds.size === 0 ? (
          <div className="py-20 text-center text-neutral-400">Select an account in sidebar</div>
        ) : filteredEvents.length === 0 && !isLoadingStreams ? (
          <div className="py-20 text-center text-neutral-400">No upcoming events.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((event) => {
              const startDate = new Date(event.start?.dateTime || event.start?.date || Date.now());
              const endDate = new Date(event.end?.dateTime || event.end?.date || Date.now());
              const isAllDay = !event.start?.dateTime;
              
              return (
                <div key={`${event.accountId}-${event.id}`} onClick={() => window.open(event.htmlLink, '_blank')}
                     className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0 opacity-70 group-hover:opacity-100 transition-opacity">
                      {event.accountPhoto && <img src={event.accountPhoto} alt="" className="w-4 h-4 rounded-full" />}
                      <span className="text-[10px] text-neutral-600 font-medium truncate" title={event.accountEmail}>{event.accountEmail}</span>
                    </div>
                    <div className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md shrink-0">
                      {startDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="font-bold text-neutral-900 mb-2 leading-snug">{event.summary || 'Busy'}</div>
                  <div className="mt-auto text-xs font-semibold text-neutral-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {isAllDay ? 'All Day' : `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
