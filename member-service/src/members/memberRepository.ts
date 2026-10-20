import { normalizeEmail } from './email';
import { CreateMemberInput, Member, UpdateMemberInput } from './types';

export class MemberRepository {
  private members: Member[] = [];

  private nextId: number = 1;

  list(): Member[] {
    return this.members.slice();
  }

  findById(id: number): Member | undefined {
    return this.members.find((member) => member.id === id);
  }

  findByEmail(email: string, excludeId?: number): Member | undefined {
    const needle = normalizeEmail(email);

    return this.members.find((member) => member.email === needle && member.id !== excludeId);
  }

  create(input: CreateMemberInput): Member {
    const member: Member = {
      id: this.nextId,
      name: input.name,
      email: normalizeEmail(input.email),
    };

    this.nextId += 1;
    this.members.push(member);

    return member;
  }

  update(id: number, input: UpdateMemberInput): Member | undefined {
    const member = this.findById(id);

    if (!member) {
      return undefined;
    }

    if (input.name !== undefined) {
      member.name = input.name;
    }

    if (input.email !== undefined) {
      member.email = normalizeEmail(input.email);
    }

    return member;
  }

  delete(id: number): boolean {
    const index = this.members.findIndex((member) => member.id === id);

    if (index === -1) {
      return false;
    }

    this.members.splice(index, 1);

    return true;
  }

  reset(): void {
    this.members = [];
    this.nextId = 1;
  }
}

export const memberRepository = new MemberRepository();
