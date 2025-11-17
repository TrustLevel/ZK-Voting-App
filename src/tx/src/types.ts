// Type definitions for Plutus validator structure
export interface ValidatorSchema {
  '$ref': string;
}

export interface ValidatorRedeemer {
  title: string;
  schema: ValidatorSchema;
}

export interface ValidatorParameter {
  title: string;
  schema: object;
}

export interface PlutusValidatorBlueprint {
  title: string;
  redeemer: ValidatorRedeemer;
  parameters: ValidatorParameter[];
  compiledCode: string;
  hash: string;
}