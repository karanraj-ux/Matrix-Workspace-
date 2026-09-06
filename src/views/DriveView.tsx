import React from 'react';
import { FileText, Loader2, Download, ExternalLink, ArrowRightLeft } from 'lucide-react';
import { DriveFile } from '../types';

interface DriveViewProps {
  activeAccountIds: Set<string>;
  isLoadingStreams: boolean;
  filteredFiles: DriveFile[];
  setTransferFile: (file: DriveFile) => void;
}

export const DriveView: React.FC<DriveViewProps> = ({
  activeAccountIds,
  isLoadingStreams,
  filteredFiles,
  setTransferFile
}) => {
  return (
    <div className="absolute inset-0 bg-neutral-50 flex-col overflow-y-auto flex">
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 leading-tight">Omni-Drive Workspace</h2>
              <p className="text-sm text-neutral-500">Cross-account file routing and asset management.</p>
            </div>
          </div>
          {isLoadingStreams && <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />}
        </div>

        {activeAccountIds.size === 0 ? (
          <div className="py-20 text-center text-neutral-400">Select an account in sidebar</div>
        ) : filteredFiles.length === 0 && !isLoadingStreams ? (
          <div className="py-20 text-center text-neutral-400">No files found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFiles.map((file) => (
              <div key={`${file.accountId}-${file.id}`} 
                   className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-300 transition-all group flex flex-col h-32">
                <div className="flex-1 flex items-start gap-3 min-h-0">
                  <div className="shrink-0 mt-1 cursor-pointer" onClick={() => window.open(file.webViewLink, '_blank')}>
                    {file.iconLink ? <img src={file.iconLink} alt="" className="w-6 h-6" /> : <FileText className="w-6 h-6 text-neutral-400" />}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.open(file.webViewLink, '_blank')}>
                    <div className="font-medium text-sm text-neutral-900 line-clamp-2 leading-snug mb-1.5">{file.name}</div>
                    <div className="flex items-center gap-1.5 opacity-70">
                      <span className="text-[10px] text-neutral-600 truncate font-medium" title={file.accountEmail}>{file.accountEmail}</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 pt-3 mt-auto flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setTransferFile(file)} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors mr-auto text-xs font-medium">
                    <ArrowRightLeft size={12} /> Transfer
                  </button>
                  {file.webContentLink && (
                    <button onClick={() => window.open(file.webContentLink, '_blank')} className="p-1.5 hover:bg-green-50 rounded-lg text-neutral-500 hover:text-green-600 transition-colors">
                      <Download size={16} />
                    </button>
                  )}
                  <button onClick={() => window.open(file.webViewLink, '_blank')} className="p-1.5 hover:bg-blue-50 rounded-lg text-neutral-500 hover:text-blue-600 transition-colors">
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
