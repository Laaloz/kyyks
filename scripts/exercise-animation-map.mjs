// Kyyksin liikkeiden mappaus animoituihin liikedemoihin (ExerciseDB / GymVisual -media_id).
//
// Animaatio on ensisijainen esitys: se näyttää koko liikeradan ja korostaa työskentelevät
// lihakset, mitä still-pari ei tee. Liikkeet joilta animaatio puuttuu putoavat takaisin
// exercise-media-map.mjs:n still-pariin — lähteillä on eri aukot, joten ne täydentävät toisiaan.
//
// LISENSSI: media on © Gym visual (https://gymvisual.com/) eikä sille ole julkista
// käyttöehtoa. Kyyks on tällä hetkellä ei-kaupallinen (omistaja + muutama käyttäjä), missä
// tämä on käytännössä ongelmaton. JOS Kyyksistä tulee maksullinen tuote, tämä media pitää
// korvata ostetulla lisenssillä (GymVisual N-CRFL, ~$100–400) tai palata pelkkään
// still-pariin, joka on public domain.
//
// Tunniste on lähteen media_id; GIF haetaan osoitteesta
// https://static.exercisedb.dev/media/{media_id}.gif
//
// 125/133 liikkeellä on animaatio.

// Valmentajien omat liikkeet, joille löytyi vastine liikepankista. Avaimena on kannan UUID,
// EI external_key: mapExerciseRow palauttaa `external_key ?? id`, joten external_keyn
// asettaminen jälkikäteen vaihtaisi liikkeen id:n ja irrottaisi sen treenihistoriasta
// (workout_set_logs.exercise_id viittaa UUID:hen).
//
// "Vatsarutistus GHR penkissä" jätetty tarkoituksella pois — lähin vastine on "decline crunch",
// joka on eri väline. Väärä kuva opettaisi väärin.
export const customExerciseAnimationMap = {
  "763d82df-f997-4918-961f-a0be5280c4c8": "Hx1WC8I", // Ojentajapunnerrus taljassa vinopenkillä → cable incline triceps extension
  "a531d2cc-2e32-4cba-ac3d-e8861a99a287": "aTNKZiC", // Vipunosto vinopenkillä → dumbbell incline one arm lateral raise
  "d8617e5a-8f5d-4f9b-a079-c345ae15f640": "SpYC0Kp", // Penkkipunnerrus käsipainoilla → dumbbell bench press (sama kuin globaali Käsipainopenkki)
};

export const exerciseAnimationMap = {
  ex_back_squat: "qXTaZnJ",  // Takakyykky → barbell full squat
  ex_front_squat: "zG0zs85",  // Etukyykky → barbell front squat
  ex_goblet_squat: "yn8yg1r",  // Goblet-kyykky → dumbbell goblet squat
  ex_leg_press: "10Z2DXU",  // Jalkaprässi → sled 45в° leg press
  ex_hack_squat: "Qa55kX1",  // Hack-kyykky → sled hack squat
  ex_split_squat: "9E25EOx",  // Bulgarialainen askelkyykky → split squats
  ex_walking_lunge: "IZVHb27",  // Kävelyaskelkyykky → walking lunge
  ex_step_up: "Kxquu2E",  // Step-up → barbell step-up
  ex_romanian_deadlift: "wQ2c4XD",  // Romanialainen maastaveto → barbell romanian deadlift
  ex_deadlift: "ila4NZS",  // Maastaveto → barbell deadlift
  ex_sumo_deadlift: "KgI0tqW",  // Sumomaastaveto → barbell sumo deadlift
  ex_good_morning: "XlZ4lAC",  // Good morning → barbell good morning
  // EI OSUMAA: ex_hip_thrust  (Hip thrust)
  ex_glute_bridge: "GibBPPg",  // Glute bridge → glute bridge march
  ex_leg_curl: "17lJ1kr",  // Takareisikoukistus → lever lying leg curl
  ex_leg_extension: "my33uHU",  // Jalanojennus → lever leg extension
  ex_calf_raise_standing: "yl2IYyy",  // Pohjenousu seisten → cable standing calf raise
  ex_calf_raise_seated: "bOOdeyc",  // Pohjenousu istuen → lever seated calf raise
  ex_hip_abduction_machine: "7WaDzyL",  // Lonkan loitonnus laitteessa → side hip abduction
  ex_hip_adduction_machine: "hBGWILP",  // Lonkan lähennys laitteessa → cable hip adduction
  ex_bench_press: "EIeI8Vf",  // Penkkipunnerrus → barbell bench press
  ex_incline_bench_press: "3TZduzM",  // Vinopenkki tangolla → barbell incline bench press
  ex_decline_bench_press: "GrO65fd",  // Alavinopenkki tangolla → barbell decline bench press
  ex_db_bench_press: "SpYC0Kp",  // Käsipainopenkki → dumbbell bench press
  ex_incline_db_press: "ns0SIbU",  // käsin valittu → dumbbell incline bench press
  ex_chest_fly_db: "yz9nUhF",  // Rintafly käsipainoilla → dumbbell fly
  ex_cable_fly: "FVmZVhk",  // Taljafly → cable low fly
  ex_pec_deck: "v3xmPAR",  // Pec deck → lever seated fly
  ex_push_up: "I4hDWkc",  // Punnerrus → push-up
  ex_dips: "9WTm7dq",  // Dippi → chest dip
  // EI OSUMAA: ex_overhead_press  (Pystypunnerrus tangolla)
  ex_seated_db_press: "znQUdHY",  // Istuva pystypunnerrus käsipainoilla → dumbbell seated shoulder press
  ex_arnold_press: "Xy4jlWA",  // Arnold press → dumbbell arnold press
  ex_lateral_raise: "DsgkuIt",  // Vipunosto sivulle → dumbbell lateral raise
  ex_front_raise: "u2X71Np",  // Vipunosto eteen → cable front raise
  ex_rear_delt_fly: "EAs3xL9",  // Takaolkapääfly → dumbbell reverse fly
  ex_upright_row: "cALKspW",  // Pystysoutu → cable upright row
  ex_row: "BJ0Hz5L",  // Kulmasoutu → dumbbell bent over row
  ex_barbell_row: "eZyBC3j",  // Kulmasoutu tangolla → barbell bent over row
  ex_chest_supported_row: "dmgMp3n",  // Rintasoutu penkiltä → barbell incline row
  ex_seated_cable_row: "fUBheHs",  // käsin valittu → cable seated row
  ex_low_cable_row: "km0sQC0",  // Alatalja → band one arm standing low row
  ex_lat_pulldown: "RVwzP10",  // Ylätalja → cable pulldown
  ex_pulldown: "RVwzP10",  // Pulldown → cable pulldown
  ex_pull_up: "lBDjFxJ",  // Leuanveto myötäotteella → pull-up
  ex_chin_up: "T2mxWqc",  // Leuanveto vastaotteella → chin-up
  ex_single_arm_cable_row: "bKWbrTA",  // Yhden käden soutu taljassa → one arm towel row
  ex_face_pull: "wqNPGCg",  // käsin valittu → cable rear delt row (with rope)
  ex_shrug: "Eg98Ft9",  // Hartiannosto → cable shrug
  ex_straight_arm_pulldown: "x69MAlq",  // Suorin käsin ylätaljaveto → cable straight arm pulldown
  ex_close_grip_bench_press: "da4cXST",  // Kapea penkkipunnerrus → ez-bar close-grip bench press
  ex_tricep_pushdown: "3ZflifB",  // Ojentajapunnerrus taljassa → cable pushdown
  ex_overhead_tricep_extension: "5uFK1xr",  // Ojentaja pään yli → barbell seated overhead triceps extension
  ex_skullcrusher: "1cTf2Ux",  // Ranskalainen punnerrus → ez bar standing french press
  ex_barbell_curl: "25GPyDY",  // Hauiskääntö tangolla → barbell curl
  ex_db_curl: "NbVPDMW",  // Hauiskääntö käsipainoilla → dumbbell biceps curl
  ex_hammer_curl: "slDvUAU",  // Vasarahauiskääntö → dumbbell hammer curl
  ex_preacher_curl: "P2lNrGL",  // Scott-hauiskääntö → cable preacher curl
  ex_cable_curl: "G08RZcQ",  // Hauiskääntö taljassa → cable curl
  ex_plank: "VBAWRPG",  // Lankku → weighted front plank
  ex_side_plank: "KhHJ338",  // Sivulankku → push-up to side plank
  ex_dead_bug: "iny3m5y",  // Dead bug → dead bug
  ex_ab_wheel: "xnInPfE",  // Ab wheel roll-out → barbell standing ab rollerout
  ex_hanging_leg_raise: "I3tsCnC",  // Jalkojen nosto roikkuen → hanging leg raise
  ex_cable_crunch: "WW95auq",  // Vatsarutistus taljassa → cable kneeling crunch
  ex_russian_twist: "XVDdcoj",  // Russian twist → russian twist
  ex_pallof_press: "G7PXMlT",  // Pallof press → band vertical pallof press
  ex_farmers_walk: "qPEzJjA",  // Farmer's walk → farmers walk
  ex_sled_push: "XDOiFns",  // Kelkan työntö → sled forward angled calf raise
  ex_kettlebell_swing: "UHJlbu3",  // Kahvakuulaheilautus → kettlebell swing
  ex_thruster: "f7Y9eDZ",  // Thruster → barbell thruster
  ex_smith_squat: "jFtipLl",  // Kyykky smith-laitteessa → smith squat
  // EI OSUMAA: ex_box_squat  (Boksikyykky)
  // EI OSUMAA: ex_belt_squat  (Vyökyykky)
  ex_sissy_squat: "xdYPUtE",  // Sissy-kyykky → sissy squat
  ex_pistol_squat: "5bpPTHv",  // Pistoolikyykky → kettlebell pistol squat
  ex_reverse_lunge: "VaP75jl",  // Taakse-askelkyykky → barbell rear lunge
  ex_single_leg_press: "WWD6FzI",  // Yhden jalan jalkaprässi → sled 45 degrees one leg press
  ex_seated_leg_curl: "Zg3XY7P",  // Istuva takareisikoukistus → lever seated leg curl
  ex_calf_press: "7B4F5nZ",  // Pohkeet prässissä → lever calf press
  ex_trap_bar_deadlift: "jQGwmxN",  // Trap bar -maastaveto → trap bar deadlift
  ex_rack_pull: "za9Ni4z",  // Rack pull → barbell rack pull
  ex_single_leg_rdl: "gEyURal",  // Yhden jalan romanialainen maastaveto → barbell single leg deadlift
  ex_nordic_curl: "Vvwjz6N",  // Nordic hamstring curl → glute-ham raise
  ex_back_extension: "zhMwOwE",  // Selän ojennus → hyperextension
  ex_cable_pull_through: "BmrwWzo",  // Taljaveto jalkojen välistä → dumbbell sumo pull through
  ex_cable_kickback: "HEJ6DIX",  // käsin valittu → cable kickback
  ex_machine_chest_press: "T0yTjgW",  // Penkkipunnerrus laitteessa → lever chest press
  ex_smith_incline_press: "5v7KYld",  // Vinopenkki smith-laitteessa → smith incline bench press
  ex_cable_crossover: "0CXGHya",  // Taljaveto ristiin → cable cross-over variation
  ex_incline_cable_fly: "tBWXbIT",  // Vinofly taljassa → cable incline fly
  ex_db_pullover: "4U7iLb5",  // Pullover käsipainolla → lever pullover
  ex_decline_push_up: "i5cEhka",  // Jalat koholla -punnerrus → decline push-up
  ex_svend_press: "I1OBLnn",  // Svend press → weighted svend press
  ex_machine_shoulder_press: "67n3r98",  // Pystypunnerrus laite → lever shoulder press
  ex_cable_lateral_raise: "goJ6ezq",  // Vipunosto sivulle taljassa → cable lateral raise
  ex_machine_lateral_raise: "dRTfGZT",  // Vipunosto laitteessa → lever lateral raise
  ex_reverse_pec_deck: "myfUsKf",  // Käänteinen pec deck → lever seated reverse fly
  // EI OSUMAA: ex_landmine_press  (Landmine-punnerrus)
  ex_cable_front_raise: "u2X71Np",  // Vipunosto eteen taljassa → cable front raise
  ex_t_bar_row: "aaXr7ld",  // T-tankosoutu → lever t bar row
  ex_pendlay_row: "r0z6xzQ",  // Pendlay-soutu → barbell pendlay row
  ex_machine_row: "nZZZy9m",  // Soutu laitteessa → lever high row
  ex_wide_grip_pulldown: "CmEr4pM",  // Leveä ylätaljaveto → cable wide grip rear pulldown behind neck
  ex_close_grip_pulldown: "DptumMx",  // Kapea ylätaljaveto → band close-grip pulldown
  ex_inverted_row: "bZGHsAZ",  // Vaakasoutu → inverted row
  ex_rope_pushdown: "dU605di",  // käsin valittu → cable pushdown (with rope attachment)
  ex_overhead_cable_extension: "2IxROQ1",  // Ojentaja pään yli taljassa → cable overhead triceps extension (rope attachment)
  ex_bench_dip: "DQ0cqkT",  // Penkkidippi → three bench dip
  ex_diamond_push_up: "soIB2rj",  // Timanttipunnerrus → diamond push-up
  ex_db_kickback: "W6PxUkg",  // Ojentajapotku käsipainolla → dumbbell kickback
  ex_incline_db_curl: "ae9UoXQ",  // Hauiskääntö vinopenkissä → dumbbell incline curl
  ex_concentration_curl: "NvfE43H",  // Keskittynyt hauiskääntö → cable concentration curl
  ex_spider_curl: "Ye5Qxb0",  // Spider-hauiskääntö → ez barbell spider curl
  ex_reverse_curl: "eOG0r6v",  // Käänteinen hauiskääntö → cable reverse curl
  ex_machine_curl: "q6y3OhV",  // Hauiskääntö laitteessa → lever bicep curl
  ex_wrist_curl: "LrV4s90",  // Ranteenkoukistus → cable wrist curl
  ex_ab_crunch_machine: "Wgaz7pm",  // Vatsarutistus laitteessa → lever seated crunch
  ex_hanging_knee_raise: "03lzqwk",  // Polvennosto roikkuen → assisted hanging knee raise
  ex_decline_sit_up: "9Ap7miY",  // Vatsarutistus alavinopenkillä → decline crunch
  ex_bicycle_crunch: "1ZFqTDN",  // Polkupyörävatsarutistus → air bike
  ex_mountain_climber: "RJgzwny",  // Vuorikiipeilijä → mountain climber
  ex_lying_leg_raise: "WhuFnR7",  // Jalkojen nosto lattialla → lying leg raise flat bench
  // EI OSUMAA: ex_cable_woodchop  (Halonhakkuu taljassa)
  // EI OSUMAA: ex_bird_dog  (Lintukoira)
  ex_power_clean: "SiWCcTN",  // Power clean → power clean
  ex_push_press: "FS63wTN",  // Push press → dumbbell push press
  ex_box_jump: "iPm26QU",  // Loikka boksille → box jump down with one leg stabilization
  ex_burpee: "dK9394r",  // Burpee → burpee
  ex_med_ball_slam: "oHg8eop",  // Kuntopallon isku → medicine ball overhead slam
  ex_battle_ropes: "RJa4tCo",  // Battle ropes → battling ropes
  ex_high_row: "nZZZy9m",  // High row → lever high row
  // EI OSUMAA: ex_oblique_raise_bench  (Kylkinosto selkäpenkissä)
};
