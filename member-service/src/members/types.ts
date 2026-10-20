export interface Member {
  id: number;
  name: string;
  email: string;
}

export interface CreateMemberInput {
  name: string;
  email: string;
}

export interface UpdateMemberInput {
  name?: string;
  email?: string;
}
