export class PhoneNumber {
  private readonly value: string;

  private static readonly E164_REGEX = /^\+?[1-9]\d{1,14}$/;

  constructor(value: string) {
    if (!PhoneNumber.E164_REGEX.test(value)) {
      throw new Error(`PhoneNumber must be in E.164 format, got '${value}'`);
    }
    this.value = value;
  }

  public get raw(): string {
    return this.value;
  }

  public toString(): string {
    return this.value;
  }
}
