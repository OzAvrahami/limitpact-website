"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import SubmissionForm from "./SubmissionForm";

const ModalContext = createContext(null);

export function useLimitPactModal() {
  const value = useContext(ModalContext);
  if (!value) throw new Error("useLimitPactModal must be used inside ModalProvider");
  return value;
}

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const [sent, setSent] = useState(false);
  const contentRef = useRef(null);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  const openModal = (type) => {
    triggerRef.current = document.activeElement;
    setSent(false);
    setModal(type);
  };

  const closeModal = () => {
    setModal(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!modal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeModal();
      if (event.key !== "Tab" || !contentRef.current) return;
      const focusable = contentRef.current.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled):not([tabindex="-1"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!Array.from(focusable).includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modal]);

  return (
    <ModalContext.Provider value={{ openModal }}>
      <div aria-hidden={modal ? "true" : undefined} inert={modal ? "" : undefined}>
        {children}
      </div>
      {modal && (
        <div className="modalOverlay" onMouseDown={closeModal}>
          <div
            ref={contentRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={closeRef}
              className="modalClose"
              type="button"
              onClick={closeModal}
              aria-label="Close dialog"
            >
              ×
            </button>
            {sent ? (
              <Success type={modal} />
            ) : (
              <SubmissionForm key={modal} type={modal} onSuccess={() => setSent(true)} />
            )}
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function ModalButton({ modal, className = "", children }) {
  const { openModal } = useLimitPactModal();
  return (
    <button type="button" className={className} onClick={() => openModal(modal)}>
      {children}
    </button>
  );
}

function Success({ type }) {
  const isBeta = type === "beta";
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return (
    <div className="formSuccess" role="status">
      <span className="successIcon" aria-hidden="true">✓</span>
      <h3 id="modal-title" tabIndex={-1} ref={headingRef}>{isBeta ? "You're on the list" : "Message received"}</h3>
      <p>
        {isBeta
          ? "Thanks for your interest in the LimitPact private beta. We'll reach out as spots open up."
          : "Thanks for reaching out. We'll reply to your email as soon as we can."}
      </p>
    </div>
  );
}
