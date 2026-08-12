import { type PropsWithChildren } from "react";

export const Modal = ({ children }: PropsWithChildren) => {
  return <div className="modal-backdrop">{children}</div>;
};
