import React, { createContext, useContext, useState, useCallback } from 'react';
import { Message } from '../../types/message';
import { manageContextFromBackend, convertApiMessageToFrontendMessage } from './index';

// Define the context management interface
interface ContextManagerState {
  isCompacting: boolean;
  compactionError: string | null;
}

interface ContextManagerActions {
  handleAutoCompaction: (
    messages: Message[],
    setMessages: (messages: Message[]) => void,
    append: (message: Message) => void,
    setAncestorMessages?: (messages: Message[]) => void
  ) => Promise<void>;
  handleManualCompaction: (
    messages: Message[],
    setMessages: (messages: Message[]) => void,
    append?: (message: Message) => void,
    clearAlerts?: () => void,
    setAncestorMessages?: (messages: Message[]) => void
  ) => Promise<void>;
  hasCompactionMarker: (message: Message) => boolean;
}

// Create the context
const ContextManagerContext = createContext<
  (ContextManagerState & ContextManagerActions) | undefined
>(undefined);

// Create the provider component
export const ContextManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCompacting, setIsCompacting] = useState<boolean>(false);
  const [compactionError, setCompactionError] = useState<string | null>(null);

  const performCompaction = useCallback(
    async (
      messages: Message[],
      setMessages: (messages: Message[]) => void,
      append: (message: Message) => void,
      _isManual: boolean = false,
      setAncestorMessages?: (messages: Message[]) => void
    ) => {
      setIsCompacting(true);
      setCompactionError(null);

      try {
        // Get the summary from the backend
        const summaryResponse = await manageContextFromBackend({
          messages: messages,
          manageAction: 'summarize',
        });

        // Convert API messages to frontend messages
        const convertedMessages = summaryResponse.messages.map((apiMessage, index) => {
          // The server now provides the compaction marker and summary messages
          // First message should be the compaction marker (display: true, sendToLLM: false)
          // Second message should be the summary (display: false, sendToLLM: true)
          // Third message should be the continuation message (display: false, sendToLLM: true)
          if (index === 0) {
            // Compaction marker - show to user but don't send to LLM
            return convertApiMessageToFrontendMessage(apiMessage, true, false);
          } else if (index === 1) {
            // Summary message - don't show to user but send to LLM
            return convertApiMessageToFrontendMessage(apiMessage, false, true);
          } else {
            // Continuation message - don't show to user but send to LLM
            return convertApiMessageToFrontendMessage(apiMessage, false, true);
          }
        });

        // Store the original messages as ancestor messages so they can still be scrolled to
        if (setAncestorMessages) {
          const ancestorMessages = messages.map((msg) => ({
            ...msg,
            display: true,
            sendToLLM: false,
          }));
          setAncestorMessages(ancestorMessages);
        }

        // Replace messages with the server-provided messages
        setMessages(convertedMessages);

        // Automatically submit the continuation message to continue the conversation
        // This should be the third message (index 2) which contains the "I ran into a context length exceeded error..." text
        const continuationMessage = convertedMessages[2];
        if (continuationMessage) {
          setTimeout(() => {
            append(continuationMessage);
          }, 100);
        }

        setIsCompacting(false);
      } catch (err) {
        console.error('Error during compaction:', err);
        setCompactionError(err instanceof Error ? err.message : 'Unknown error during compaction');

        // Create an error marker
        const errorMarker: Message = {
          id: `compaction-error-${Date.now()}`,
          role: 'assistant',
          created: Math.floor(Date.now() / 1000),
          content: [
            {
              type: 'summarizationRequested',
              msg: 'Compaction failed. Please try again or start a new session.',
            },
          ],
          display: true,
          sendToLLM: false,
        };

        setMessages([...messages, errorMarker]);
        setIsCompacting(false);
      }
    },
    []
  );

  const handleAutoCompaction = useCallback(
    async (
      messages: Message[],
      setMessages: (messages: Message[]) => void,
      append: (message: Message) => void,
      setAncestorMessages?: (messages: Message[]) => void
    ) => {
      await performCompaction(messages, setMessages, append, false, setAncestorMessages);
    },
    [performCompaction]
  );

  const handleManualCompaction = useCallback(
    async (
      messages: Message[],
      setMessages: (messages: Message[]) => void,
      append?: (message: Message) => void,
      clearAlerts?: () => void,
      setAncestorMessages?: (messages: Message[]) => void
    ) => {
      // Hide the alert box when compaction starts
      if (clearAlerts) {
        clearAlerts();
      }

      await performCompaction(
        messages,
        setMessages,
        append || (() => {}),
        true,
        setAncestorMessages
      );
    },
    [performCompaction]
  );

  const hasCompactionMarker = useCallback((message: Message): boolean => {
    return message.content.some((content) => content.type === 'summarizationRequested');
  }, []);

  const value = {
    // State
    isCompacting,
    compactionError,

    // Actions
    handleAutoCompaction,
    handleManualCompaction,
    hasCompactionMarker,
  };

  return <ContextManagerContext.Provider value={value}>{children}</ContextManagerContext.Provider>;
};

// Create a hook to use the context
export const useContextManager = () => {
  const context = useContext(ContextManagerContext);
  if (context === undefined) {
    throw new Error('useContextManager must be used within a ContextManagerProvider');
  }
  return context;
};
