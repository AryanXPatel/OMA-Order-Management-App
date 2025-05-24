import React, { createContext, useState, useContext } from "react";
import FeedbackModal, { FeedbackType } from "../components/FeedbackModal";
import * as Haptics from "expo-haptics";

interface FeedbackContextType {
  showFeedback: (options: {
    type?: FeedbackType;
    title: string;
    message: string;
    actionText?: string;
    onAction?: () => void;
    autoDismiss?: boolean;
    dismissTime?: number;
  }) => void;
  hideFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextType>({
  showFeedback: () => {},
  hideFeedback: () => {},
});

export const useFeedback = () => useContext(FeedbackContext);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [feedbackProps, setFeedbackProps] = useState({
    type: "success" as FeedbackType,
    title: "",
    message: "",
    actionText: "",
    onAction: undefined as (() => void) | undefined,
    autoDismiss: true,
    dismissTime: 3000,
  });

  // Fix the showFeedback function parameter destructuring
  const showFeedback = ({
    type = "success",
    title,
    message,
    actionText,
    onAction,
    autoDismiss = true,
    dismissTime = 3000,
  }) => {
    if (type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === "error") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setFeedbackProps({
      type,
      title,
      message,
      actionText,
      onAction,
      autoDismiss,
      dismissTime,
    });
    setVisible(true);
  };

  const hideFeedback = () => {
    setVisible(false);
  };

  return (
    <FeedbackContext.Provider value={{ showFeedback, hideFeedback }}>
      {children}
      <FeedbackModal
        visible={visible}
        type={feedbackProps.type}
        title={feedbackProps.title}
        message={feedbackProps.message}
        actionText={feedbackProps.actionText}
        onAction={feedbackProps.onAction}
        onClose={hideFeedback}
        autoDismiss={feedbackProps.autoDismiss}
        dismissTime={feedbackProps.dismissTime}
      />
    </FeedbackContext.Provider>
  );
};
