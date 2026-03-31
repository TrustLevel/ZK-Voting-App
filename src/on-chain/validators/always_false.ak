// Always-false validator — used to permanently lock UTxOs that should never be spent.
// The VKey UTxO (Groth16 verification key datum) is sent here so it can be used
// as a read-only reference input on every vote transaction without risk of being
// accidentally spent.
validator always_false {
  else(_ctx: Data) {
    False
  }
}
