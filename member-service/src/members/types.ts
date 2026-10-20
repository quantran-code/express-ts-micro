export interface Member {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

export interface UpdateMemberActiveInput {
  active: boolean;
}

export interface CreateMemberInput {
  name: string;
  email: string;
}

export interface UpdateMemberInput {
  name?: string;
  email?: string;
}
