import { Mora, MoraNode } from "manimani";

type Status = "correct" | "incorrect" | "unanswered";

export type MoraWithStatus =  Mora & {
    node: MoraNodeWithStatus[];
    status: Status;
}

export type MoraNodeWithStatus =  MoraNode & {
    children: MoraNodeWithStatus[];
    status: Status;
}