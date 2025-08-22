use aiken/primitive/bytearray
use aiken/fuzz
use aiken/primitive/int
use aiken/crypto.{ blake2b_256 }
use aiken/crypto/bls12_381/scalar as scalar
use voting_utilities.{ serialise_signal, deserialise_signal }
use types.{ Options }


// Serialization tests.

test signal_serialization_1() {
    
    let option: Options = [(0,0)]

    let serialized_signal: ByteArray = serialise_signal(option)

    option == deserialise_signal(serialized_signal)
}

test signal_serialization_2() {
    
    let option: Options = [(0,0),(1,0),(2,0)]

    let serialized_signal: ByteArray = serialise_signal(option)

    option == deserialise_signal(serialized_signal)
}

test signal_serialization_3() {
    
    let option: Options = [(0,1),(1,1),(2,1)]

    let serialized_signal: ByteArray = serialise_signal(option)

    option == deserialise_signal(serialized_signal)
}

fn random_options() -> Fuzzer<Options> {
    fuzz.list(fuzz.tuple(fuzz.int(), fuzz.int()))
}

test signal_serialization_equivalence_property(msg: Options via random_options()) {
    let serialized_msg = serialise_signal(msg) 
    msg == deserialise_signal(serialized_msg)
}

test signal_transformation_1() {
    let msg: Options = [(0,0)]
    let serialized_msg = serialise_signal(msg)

    

    // bytearray.concat(#"0000000000000000", signal_bytes)
    let signal_to_int: Int = int.from_bytearray_big_endian(serialized_msg)
    let signal_to_byte_array: ByteArray = bytearray.from_int_big_endian(signal_to_int, 0)

    msg == deserialise_signal(signal_to_byte_array)
}

test signal_transformation_property(msg: Options via random_options()) {
    let serialized_msg = serialise_signal(msg)

    let signal_to_int: Int = int.from_bytearray_big_endian(serialized_msg)
    let signal_to_byte_array: ByteArray = bytearray.from_int_big_endian(signal_to_int, 0)

    msg == deserialise_signal(signal_to_byte_array)
}

test signal_concat_transformation_1() {
    let signal_bytes = serialise_signal([(2,1)])
    let padded_signal = bytearray.concat(#"0000000000000000", signal_bytes)  // Pad with 8 zero bytes at start
    let signal_int = int.from_bytearray_big_endian(padded_signal)
    expect Some(signal_scalar) = scalar.from_bytearray_big_endian(signal_bytes)
    let signal_scalar_to_int = scalar.to_int(signal_scalar)
    signal_int == signal_scalar_to_int

    // signal_options == 1
    
    // padded_signal == #"" && 
}

test signal_digest() {
    let signal_bytes = serialise_signal([(2,1)])
    #"37623354bb4f21010e8d5e298310c6942ff168d1e4801b306edd392e20998294" == blake2b_256(signal_bytes)
}

test signal_digest_scalar() {
    let signal_bytes = serialise_signal([(2,1)]) |> blake2b_256()
    expect Some(signal_scalar) = scalar.from_bytearray_big_endian(signal_bytes)
    let signal_scalar_to_int = scalar.to_int(signal_scalar)
    25050711957853089676855563252373407134946460892559238457710929576024828641940 == signal_scalar_to_int
}

test signal_transformation() {
    let signal_bytes = serialise_signal([(2,1)])
    signal_bytes == #"9f9f0201ffff"
    
}

