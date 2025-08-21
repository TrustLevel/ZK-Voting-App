use aiken/primitive/bytearray
use aiken/fuzz
use aiken/primitive/int
use utilities.{ serialise_signal, deserialise_signal }
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

