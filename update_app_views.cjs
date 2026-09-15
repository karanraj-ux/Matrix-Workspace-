const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\{\/\* Dynamic Views \*\/\}\s*<div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">\s*<ErrorBoundary>([\s\S]*?)<\/ErrorBoundary>\s*<\/div>/;

const newBlock = `{/* Dynamic Views */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative bg-[#0a0a0a]">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 15, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.99 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 flex flex-col overflow-hidden"
              >
                {currentView === 'dashboard' && (
                  <div className="absolute inset-0 bg-[#0a0a0a] flex-col overflow-y-auto flex">
                    <DashboardView 
                      accounts={accounts}
                      filteredEmails={filteredEmails}
                      filteredFiles={filteredFiles}
                      filteredEvents={filteredEvents}
                      handleLogin={handleLogin}
                      setCurrentView={setCurrentView}
                      openEmail={openEmail}
                    />
                  </div>
                )}
                {currentView === 'mail' && (
                  <div className="absolute inset-0 bg-[#0a0a0a] flex">
                    <MailView 
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredEmails={filteredEmails}
                      activeEmail={activeEmail}
                      openEmail={openEmail}
                      setActiveEmail={setActiveEmail}
                      executeEmailAction={executeEmailAction}
                      isEmailLoading={isEmailLoading}
                      emailHtml={emailHtml}
                      onReply={(email) => {
                        setReplyToEmail(email);
                        setIsComposeOpen(true);
                      }}
                      onSaveAttachmentToDrive={(email, attachment) => {
                        setAttachmentToSave({ email, attachment });
                      }}
                    />
                  </div>
                )}
                {currentView === 'drive' && (
                  <div className="absolute inset-0 bg-[#0a0a0a] flex-col overflow-y-auto flex">
                    <DriveView 
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredFiles={filteredFiles}
                      setTransferFile={setTransferFile}
                      onAttachToEmail={(file) => {
                        setFileToAttach(file);
                        setReplyToEmail(null);
                        setIsComposeOpen(true);
                      }}
                    />
                  </div>
                )}
                {currentView === 'settings' && (
                  <div className="absolute inset-0 bg-[#0a0a0a] flex-col overflow-y-auto flex">
                    <SettingsView 
                      isByokMode={isByokMode}
                      setIsByokMode={setIsByokMode}
                      customClientId={customClientId}
                      setCustomClientId={setCustomClientId}
                      handleLogin={handleLogin}
                    />
                  </div>
                )}
                {currentView === 'calendar' && (
                  <div className="absolute inset-0 bg-[#0a0a0a] flex-col overflow-y-auto flex">
                    <CalendarView 
                      activeAccountIds={activeAccountIds}
                      isLoadingStreams={isLoadingStreams}
                      filteredEvents={filteredEvents}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>`;

content = content.replace(regex, newBlock);
fs.writeFileSync('src/App.tsx', content);

