import React from "react";

export interface ErrorAlertProps {
  message: string | null;
  onDismiss?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onDismiss }) => {
  if (!message) {
    return null;
  }

  return (
    <div className="alert alert-error" role="alert" aria-live="assertive">
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="alert-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error message"
        >
          Dismiss
        </button>
      )}
    </div>
  );
};
