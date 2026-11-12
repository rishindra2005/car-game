;; Velocity Rush — batched NPC kinematics.
;; Memory layout: Float32 array at byte offset 0, stride 6 floats per car:
;;   [x, z, heading, speed, targetSpeed, steer]
;; All arithmetic is done in f64 with the same operation order as the JS fallback
;; (src/physics/wasm.js) so results are bit-identical after f32 storage.
(module
  (memory (export "memory") 1)

  ;; sin via range reduction to [-pi/2, pi/2] + Taylor series to x^11
  (func $sin (param $x f64) (result f64)
    (local $x2 f64)
    ;; x = x - 2pi * floor((x + pi) / 2pi)  -> [-pi, pi)
    (local.set $x
      (f64.sub (local.get $x)
        (f64.mul (f64.const 6.283185307179586)
          (f64.floor (f64.div (f64.add (local.get $x) (f64.const 3.141592653589793))
                              (f64.const 6.283185307179586))))))
    (if (f64.gt (local.get $x) (f64.const 1.5707963267948966))
      (then (local.set $x (f64.sub (f64.const 3.141592653589793) (local.get $x)))))
    (if (f64.lt (local.get $x) (f64.const -1.5707963267948966))
      (then (local.set $x (f64.sub (f64.const -3.141592653589793) (local.get $x)))))
    (local.set $x2 (f64.mul (local.get $x) (local.get $x)))
    ;; x*(1 - x2/6*(1 - x2/20*(1 - x2/42*(1 - x2/72*(1 - x2/110)))))
    (f64.mul (local.get $x)
      (f64.sub (f64.const 1)
        (f64.mul (f64.div (local.get $x2) (f64.const 6))
          (f64.sub (f64.const 1)
            (f64.mul (f64.div (local.get $x2) (f64.const 20))
              (f64.sub (f64.const 1)
                (f64.mul (f64.div (local.get $x2) (f64.const 42))
                  (f64.sub (f64.const 1)
                    (f64.mul (f64.div (local.get $x2) (f64.const 72))
                      (f64.sub (f64.const 1)
                        (f64.div (local.get $x2) (f64.const 110))))))))))))
  )

  (func $cos (param $x f64) (result f64)
    (call $sin (f64.add (local.get $x) (f64.const 1.5707963267948966))))

  ;; integrate(count, dt)
  (func (export "integrate") (param $count i32) (param $dt f64)
    (local $i i32) (local $p i32)
    (local $x f64) (local $z f64) (local $h f64) (local $s f64) (local $t f64) (local $st f64)
    (local $diff f64) (local $lim f64)
    (block $done
      (loop $next
        (br_if $done (i32.ge_s (local.get $i) (local.get $count)))
        (local.set $p (i32.mul (local.get $i) (i32.const 24)))
        (local.set $x (f64.promote_f32 (f32.load offset=0 (local.get $p))))
        (local.set $z (f64.promote_f32 (f32.load offset=4 (local.get $p))))
        (local.set $h (f64.promote_f32 (f32.load offset=8 (local.get $p))))
        (local.set $s (f64.promote_f32 (f32.load offset=12 (local.get $p))))
        (local.set $t (f64.promote_f32 (f32.load offset=16 (local.get $p))))
        (local.set $st (f64.promote_f32 (f32.load offset=20 (local.get $p))))
        ;; speed approaches target: accel 4 m/s^2, decel 8 m/s^2
        (local.set $diff (f64.sub (local.get $t) (local.get $s)))
        (if (f64.gt (local.get $diff) (f64.const 0))
          (then
            (local.set $lim (f64.mul (f64.const 4) (local.get $dt)))
            (if (f64.gt (local.get $diff) (local.get $lim)) (then (local.set $diff (local.get $lim)))))
          (else
            (local.set $lim (f64.mul (f64.const -8) (local.get $dt)))
            (if (f64.lt (local.get $diff) (local.get $lim)) (then (local.set $diff (local.get $lim))))))
        (local.set $s (f64.add (local.get $s) (local.get $diff)))
        ;; yaw rate = speed * steer / wheelbase(2.6)
        (local.set $h (f64.add (local.get $h)
          (f64.mul (f64.div (f64.mul (local.get $s) (local.get $st)) (f64.const 2.6)) (local.get $dt))))
        (if (f64.gt (local.get $h) (f64.const 3.141592653589793))
          (then (local.set $h (f64.sub (local.get $h) (f64.const 6.283185307179586)))))
        (if (f64.lt (local.get $h) (f64.const -3.141592653589793))
          (then (local.set $h (f64.add (local.get $h) (f64.const 6.283185307179586)))))
        ;; forward = (-sin h, -cos h)
        (local.set $x (f64.sub (local.get $x) (f64.mul (f64.mul (call $sin (local.get $h)) (local.get $s)) (local.get $dt))))
        (local.set $z (f64.sub (local.get $z) (f64.mul (f64.mul (call $cos (local.get $h)) (local.get $s)) (local.get $dt))))
        (f32.store offset=0 (local.get $p) (f32.demote_f64 (local.get $x)))
        (f32.store offset=4 (local.get $p) (f32.demote_f64 (local.get $z)))
        (f32.store offset=8 (local.get $p) (f32.demote_f64 (local.get $h)))
        (f32.store offset=12 (local.get $p) (f32.demote_f64 (local.get $s)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
  )
)
