// Kyyksin liikkeiden (lib/demo-data.ts) mappaus free-exercise-db:n liikkeisiin.
//
// Lähde: https://github.com/yuhonas/free-exercise-db (Unlicense / public domain)
// Jokaisella lähdeliikkeellä on tasan 2 kuvaa: {id}/0.jpg = alkuasento, {id}/1.jpg = loppuasento.
// UI ristihäivyttää parin, jolloin liikerata hahmottuu ilman videota.
//
// Mappaus on tehty ohjelmallisesti nimi- ja välinehaulla ja tarkistettu käsin. Kahdeksalle
// liikkeelle ei ole vastinetta — ne jäävät ilman kuvaa ja näyttävät pelkän cuen kuten ennenkin.
// Väärän välineen kuva olisi huonompi kuin ei kuvaa, joten likimääräisiä osumia ei ole otettu.
//
// 125/133 liikkeellä on kuvat.

export const exerciseMediaMap = {
  ex_back_squat: "Barbell_Squat",  // Takakyykky → Barbell Squat   // vaihtoehtoja: Barbell Full Squat, Barbell Squat To A Bench
  ex_front_squat: "Front_Squat_Clean_Grip",  // Etukyykky → Front Squat (Clean Grip)   // vaihtoehtoja: Front Squats With Two Kettlebells
  ex_goblet_squat: "Goblet_Squat",  // Goblet-kyykky → Goblet Squat
  ex_leg_press: "Leg_Press",  // Jalkaprässi → Leg Press   // vaihtoehtoja: Calf Press On The Leg Press Machine, Narrow Stance Leg Press
  ex_hack_squat: "Hack_Squat",  // Hack-kyykky → Hack Squat   // vaihtoehtoja: Barbell Hack Squat, Narrow Stance Hack Squats
  ex_split_squat: "Split_Squats",  // Bulgarialainen askelkyykky → Split Squats   // vaihtoehtoja: Barbell Side Split Squat, Smith Single-Leg Split Squat
  ex_walking_lunge: "Barbell_Walking_Lunge",  // Kävelyaskelkyykky → Barbell Walking Lunge   // vaihtoehtoja: Bodyweight Walking Lunge
  ex_step_up: "Barbell_Step_Ups",  // Step-up → Barbell Step Ups   // vaihtoehtoja: Dumbbell Step Ups, Step-up with Knee Raise
  ex_romanian_deadlift: "Romanian_Deadlift",  // Romanialainen maastaveto → Romanian Deadlift   // vaihtoehtoja: Romanian Deadlift from Deficit, Smith Machine Stiff-Legged Deadlift
  ex_deadlift: "Barbell_Deadlift",  // Maastaveto → Barbell Deadlift   // vaihtoehtoja: Deadlift with Bands, Deadlift with Chains
  ex_sumo_deadlift: "Sumo_Deadlift",  // Sumomaastaveto → Sumo Deadlift   // vaihtoehtoja: Reverse Band Sumo Deadlift, Sumo Deadlift with Bands
  ex_good_morning: "Good_Morning",  // Good morning → Good Morning   // vaihtoehtoja: Band Good Morning, Band Good Morning (Pull Through)
  ex_hip_thrust: "Barbell_Hip_Thrust",  // Hip thrust → Barbell Hip Thrust
  ex_glute_bridge: "Butt_Lift_Bridge",  // Glute bridge → Butt Lift (Bridge)   // vaihtoehtoja: Barbell Glute Bridge, Single Leg Glute Bridge
  ex_leg_curl: "Ball_Leg_Curl",  // Takareisikoukistus → Ball Leg Curl   // vaihtoehtoja: Lying Leg Curls, Seated Leg Curl
  ex_leg_extension: "Leg_Extensions",  // Jalanojennus → Leg Extensions   // vaihtoehtoja: Single-Leg Leg Extension
  ex_calf_raise_standing: "Standing_Calf_Raises",  // Pohjenousu seisten → Standing Calf Raises   // vaihtoehtoja: Rocking Standing Calf Raise, Standing Barbell Calf Raise
  ex_calf_raise_seated: "Seated_Calf_Raise",  // Pohjenousu istuen → Seated Calf Raise   // vaihtoehtoja: Barbell Seated Calf Raise
  ex_hip_abduction_machine: "Thigh_Abductor",  // Lonkan loitonnus laitteessa → Thigh Abductor
  ex_hip_adduction_machine: "Thigh_Adductor",  // Lonkan lähennys laitteessa → Thigh Adductor   // vaihtoehtoja: Band Hip Adductions, Cable Hip Adduction
  ex_bench_press: "Decline_Barbell_Bench_Press",  // Penkkipunnerrus → Decline Barbell Bench Press   // vaihtoehtoja: Barbell Bench Press - Medium Grip, Close-Grip Barbell Bench Press
  ex_incline_bench_press: "Barbell_Incline_Bench_Press_-_Medium_Grip",  // Vinopenkki tangolla → Barbell Incline Bench Press - Medium Grip
  ex_decline_bench_press: "Decline_Barbell_Bench_Press",  // Alavinopenkki tangolla → Decline Barbell Bench Press   // vaihtoehtoja: Wide-Grip Decline Barbell Bench Press
  ex_db_bench_press: "Dumbbell_Bench_Press",  // Käsipainopenkki → Dumbbell Bench Press   // vaihtoehtoja: Decline Dumbbell Bench Press, Dumbbell Bench Press with Neutral Grip
  ex_incline_db_press: "Incline_Dumbbell_Press",  // Vinopenkki käsipainoilla → Incline Dumbbell Press
  ex_chest_fly_db: "Dumbbell_Flyes",  // Rintafly käsipainoilla → Dumbbell Flyes   // vaihtoehtoja: Decline Dumbbell Flyes, Incline Dumbbell Flyes
  ex_cable_fly: "Cable_Crossover",  // Taljafly → Cable Crossover   // vaihtoehtoja: Cable Rear Delt Fly, Flat Bench Cable Flyes
  ex_pec_deck: "Butterfly",  // Pec deck → Butterfly
  ex_push_up: "Pushups",  // Punnerrus → Pushups   // vaihtoehtoja: Push-Up Wide, Push-Ups - Close Triceps Position
  ex_dips: "Dip_Machine",  // Dippi → Dip Machine   // vaihtoehtoja: Dips - Chest Version, Dips - Triceps Version
  ex_overhead_press: "Barbell_Shoulder_Press",  // Pystypunnerrus tangolla → Barbell Shoulder Press   // vaihtoehtoja: Seated Barbell Military Press
  ex_seated_db_press: "Seated_Dumbbell_Press",  // Istuva pystypunnerrus käsipainoilla → Seated Dumbbell Press   // vaihtoehtoja: Dumbbell Shoulder Press
  ex_arnold_press: "Arnold_Dumbbell_Press",  // Arnold press → Arnold Dumbbell Press   // vaihtoehtoja: Kettlebell Arnold Press
  ex_lateral_raise: "Side_Lateral_Raise",  // Vipunosto sivulle → Side Lateral Raise   // vaihtoehtoja: Seated Side Lateral Raise
  ex_front_raise: "Front_Raise_And_Pullover",  // Vipunosto eteen → Front Raise And Pullover   // vaihtoehtoja: Side Laterals to Front Raise
  ex_rear_delt_fly: "Reverse_Flyes",  // Takaolkapääfly → Reverse Flyes   // vaihtoehtoja: Barbell Rear Delt Row, Bent Over Dumbbell Rear Delt Raise With Head On Bench
  ex_upright_row: "Upright_Row_-_With_Bands",  // Pystysoutu → Upright Row - With Bands   // vaihtoehtoja: Dumbbell One-Arm Upright Row, Smith Machine One-Arm Upright Row
  ex_row: "One-Arm_Dumbbell_Row",  // Kulmasoutu → One-Arm Dumbbell Row   // vaihtoehtoja: Bent Over Two-Dumbbell Row, Bent Over Two-Dumbbell Row With Palms In
  ex_barbell_row: "Bent_Over_Barbell_Row",  // Kulmasoutu tangolla → Bent Over Barbell Row
  ex_chest_supported_row: "Dumbbell_Incline_Row",  // Rintasoutu penkiltä → Dumbbell Incline Row
  ex_seated_cable_row: "Seated_Cable_Rows",  // Istuva soutu taljassa → Seated Cable Rows
  ex_low_cable_row: "Seated_Cable_Rows",  // Alatalja → Seated Cable Rows
  ex_lat_pulldown: "V-Bar_Pulldown",  // Ylätalja → V-Bar Pulldown   // vaihtoehtoja: Close-Grip Front Lat Pulldown, Full Range-Of-Motion Lat Pulldown
  ex_pulldown: "V-Bar_Pulldown",  // Pulldown → V-Bar Pulldown   // vaihtoehtoja: Close-Grip Front Lat Pulldown, Full Range-Of-Motion Lat Pulldown
  ex_pull_up: "Pullups",  // Leuanveto myötäotteella → Pullups
  ex_chin_up: "Chin-Up",  // Leuanveto vastaotteella → Chin-Up   // vaihtoehtoja: One Arm Chin-Up
  ex_single_arm_cable_row: "One-Arm_Dumbbell_Row",  // Yhden käden soutu taljassa → One-Arm Dumbbell Row   // vaihtoehtoja: Bent Over One-Arm Long Bar Row, Dumbbell One-Arm Upright Row
  ex_face_pull: "Face_Pull",  // Face pull → Face Pull
  ex_shrug: "Clean_Shrug",  // Hartiannosto → Clean Shrug   // vaihtoehtoja: Barbell Shrug, Barbell Shrug Behind The Back
  ex_straight_arm_pulldown: "Straight-Arm_Pulldown",  // Suorin käsin ylätaljaveto → Straight-Arm Pulldown   // vaihtoehtoja: Rope Straight-Arm Pulldown
  ex_close_grip_bench_press: "Close-Grip_Barbell_Bench_Press",  // Kapea penkkipunnerrus → Close-Grip Barbell Bench Press   // vaihtoehtoja: Smith Machine Close-Grip Bench Press
  ex_tricep_pushdown: "Triceps_Pushdown",  // Ojentajapunnerrus taljassa → Triceps Pushdown   // vaihtoehtoja: Cable Incline Pushdown, Reverse Grip Triceps Pushdown
  ex_overhead_tricep_extension: "Sled_Overhead_Triceps_Extension",  // Ojentaja pään yli → Sled Overhead Triceps Extension   // vaihtoehtoja: Cable Rope Overhead Triceps Extension, Standing Overhead Barbell Triceps Extension
  ex_skullcrusher: "Band_Skull_Crusher",  // Ranskalainen punnerrus → Band Skull Crusher   // vaihtoehtoja: Cable Lying Triceps Extension, Decline Close-Grip Bench To Skull Crusher
  ex_barbell_curl: "EZ-Bar_Curl",  // Hauiskääntö tangolla → EZ-Bar Curl   // vaihtoehtoja: Barbell Curl, Barbell Curls Lying Against An Incline
  ex_db_curl: "Seated_Dumbbell_Curl",  // Hauiskääntö käsipainoilla → Seated Dumbbell Curl   // vaihtoehtoja: Alternate Incline Dumbbell Curl, Flexor Incline Dumbbell Curls
  ex_hammer_curl: "Hammer_Curls",  // Vasarahauiskääntö → Hammer Curls   // vaihtoehtoja: Alternate Hammer Curl, Cable Hammer Curls - Rope Attachment
  ex_preacher_curl: "Preacher_Curl",  // Scott-hauiskääntö → Preacher Curl   // vaihtoehtoja: Cable Preacher Curl, Machine Preacher Curls
  ex_cable_curl: "High_Cable_Curls",  // Hauiskääntö taljassa → High Cable Curls   // vaihtoehtoja: Lying Cable Curl, Overhead Cable Curl
  ex_plank: "Plank",  // Lankku → Plank
  ex_side_plank: "Side_Bridge",  // Sivulankku → Side Bridge   // vaihtoehtoja: Push Up to Side Plank
  ex_dead_bug: "Dead_Bug",  // Dead bug → Dead Bug
  ex_ab_wheel: "Ab_Roller",  // Ab wheel roll-out → Ab Roller   // vaihtoehtoja: Barbell Ab Rollout, Barbell Ab Rollout - On Knees
  ex_hanging_leg_raise: "Hanging_Leg_Raise",  // Jalkojen nosto roikkuen → Hanging Leg Raise
  ex_cable_crunch: "Rope_Crunch",  // Vatsarutistus taljassa → Rope Crunch   // vaihtoehtoja: Bosu Ball Cable Crunch With Side Bends, Cable Crunch
  ex_russian_twist: "Russian_Twist",  // Russian twist → Russian Twist   // vaihtoehtoja: Cable Russian Twists
  ex_pallof_press: "Pallof_Press",  // Pallof press → Pallof Press   // vaihtoehtoja: Pallof Press With Rotation
  ex_farmers_walk: "Farmers_Walk",  // Farmer's walk → Farmer's Walk
  ex_sled_push: "Sled_Push",  // Kelkan työntö → Sled Push   // vaihtoehtoja: Bear Crawl Sled Drags, Prowler Sprint
  ex_kettlebell_swing: "One-Arm_Kettlebell_Swings",  // Kahvakuulaheilautus → One-Arm Kettlebell Swings
  ex_thruster: "Kettlebell_Thruster",  // Thruster → Kettlebell Thruster
  ex_smith_squat: "Smith_Machine_Squat",  // Kyykky smith-laitteessa → Smith Machine Squat   // vaihtoehtoja: Smith Machine Pistol Squat, Smith Single-Leg Split Squat
  ex_box_squat: "Box_Squat",  // Boksikyykky → Box Squat   // vaihtoehtoja: Box Squat with Bands, Box Squat with Chains
  // TODO ei osumaa: ex_belt_squat  (Vyökyykky)
  ex_sissy_squat: "Weighted_Sissy_Squat",  // Sissy-kyykky → Weighted Sissy Squat
  ex_pistol_squat: "Kettlebell_Pistol_Squat",  // Pistoolikyykky → Kettlebell Pistol Squat   // vaihtoehtoja: Smith Machine Pistol Squat
  ex_reverse_lunge: "Dumbbell_Rear_Lunge",  // Taakse-askelkyykky → Dumbbell Rear Lunge   // vaihtoehtoja: Crossover Reverse Lunge
  // TODO ei osumaa: ex_single_leg_press  (Yhden jalan jalkaprässi)
  ex_seated_leg_curl: "Seated_Leg_Curl",  // Istuva takareisikoukistus → Seated Leg Curl
  ex_calf_press: "Calf_Press",  // Pohkeet prässissä → Calf Press   // vaihtoehtoja: Calf Press On The Leg Press Machine
  ex_trap_bar_deadlift: "Trap_Bar_Deadlift",  // Trap bar -maastaveto → Trap Bar Deadlift
  ex_rack_pull: "Rack_Pulls",  // Rack pull → Rack Pulls   // vaihtoehtoja: Rack Pull with Bands
  ex_single_leg_rdl: "Kettlebell_One-Legged_Deadlift",  // Yhden jalan romanialainen maastaveto → Kettlebell One-Legged Deadlift
  ex_nordic_curl: "Glute_Ham_Raise",  // Nordic hamstring curl → Glute Ham Raise   // vaihtoehtoja: Floor Glute-Ham Raise, Natural Glute Ham Raise
  ex_back_extension: "Reverse_Hyperextension",  // Selän ojennus → Reverse Hyperextension   // vaihtoehtoja: Hyperextensions (Back Extensions), Hyperextensions With No Hyperextension Bench
  ex_cable_pull_through: "Pull_Through",  // Taljaveto jalkojen välistä → Pull Through   // vaihtoehtoja: Band Good Morning (Pull Through)
  ex_cable_kickback: "Glute_Kickback",  // käsin valittu → Glute Kickback
  ex_machine_chest_press: "Machine_Bench_Press",  // Penkkipunnerrus laitteessa → Machine Bench Press   // vaihtoehtoja: Leverage Chest Press, Leverage Decline Chest Press
  ex_smith_incline_press: "Smith_Incline_Shoulder_Raise",  // Vinopenkki smith-laitteessa → Smith Incline Shoulder Raise   // vaihtoehtoja: Smith Machine Incline Bench Press
  ex_cable_crossover: "Cable_Crossover",  // Taljaveto ristiin → Cable Crossover   // vaihtoehtoja: Cable Iron Cross, Low Cable Crossover
  ex_incline_cable_fly: "Incline_Cable_Flye",  // Vinofly taljassa → Incline Cable Flye
  ex_db_pullover: "Front_Raise_And_Pullover",  // Pullover käsipainolla → Front Raise And Pullover   // vaihtoehtoja: Bent-Arm Barbell Pullover, Bent-Arm Dumbbell Pullover
  ex_decline_push_up: "Decline_Push-Up",  // Jalat koholla -punnerrus → Decline Push-Up
  ex_svend_press: "Svend_Press",  // Svend press → Svend Press
  ex_machine_shoulder_press: "Leverage_Shoulder_Press",  // Pystypunnerrus laite → Leverage Shoulder Press
  ex_cable_lateral_raise: "Cable_Seated_Lateral_Raise",  // Vipunosto sivulle taljassa → Cable Seated Lateral Raise
  // TODO ei osumaa: ex_machine_lateral_raise  (Vipunosto laitteessa)
  // TODO ei osumaa: ex_reverse_pec_deck  (Käänteinen pec deck)
  ex_landmine_press: "Landmine_Linear_Jammer",  // käsin valittu → Landmine Linear Jammer
  // TODO ei osumaa: ex_cable_front_raise  (Vipunosto eteen taljassa)
  ex_t_bar_row: "Lying_T-Bar_Row",  // T-tankosoutu → Lying T-Bar Row   // vaihtoehtoja: T-Bar Row with Handle
  ex_pendlay_row: "Bent_Over_Barbell_Row",  // käsin valittu → Bent Over Barbell Row
  ex_machine_row: "Leverage_Iso_Row",  // Soutu laitteessa → Leverage Iso Row   // vaihtoehtoja: Leverage High Row
  ex_wide_grip_pulldown: "Wide-Grip_Lat_Pulldown",  // Leveä ylätaljaveto → Wide-Grip Lat Pulldown   // vaihtoehtoja: Wide-Grip Pulldown Behind The Neck
  ex_close_grip_pulldown: "Close-Grip_Front_Lat_Pulldown",  // Kapea ylätaljaveto → Close-Grip Front Lat Pulldown
  ex_inverted_row: "Inverted_Row",  // Vaakasoutu → Inverted Row   // vaihtoehtoja: Inverted Row with Straps
  ex_rope_pushdown: "Triceps_Pushdown_-_Rope_Attachment",  // käsin valittu → Triceps Pushdown - Rope Attachment
  ex_overhead_cable_extension: "Overhead_Cable_Curl",  // Ojentaja pään yli taljassa → Overhead Cable Curl
  ex_bench_dip: "Bench_Dips",  // Penkkidippi → Bench Dips   // vaihtoehtoja: Weighted Bench Dip
  ex_diamond_push_up: "Close-Grip_Push-Up_off_of_a_Dumbbell",  // Timanttipunnerrus → Close-Grip Push-Up off of a Dumbbell
  ex_db_kickback: "Tricep_Dumbbell_Kickback",  // Ojentajapotku käsipainolla → Tricep Dumbbell Kickback
  ex_incline_db_curl: "Incline_Dumbbell_Curl",  // Hauiskääntö vinopenkissä → Incline Dumbbell Curl   // vaihtoehtoja: Alternate Incline Dumbbell Curl, Dumbbell Prone Incline Curl
  ex_concentration_curl: "Concentration_Curls",  // Keskittynyt hauiskääntö → Concentration Curls   // vaihtoehtoja: Standing Concentration Curl
  ex_spider_curl: "Spider_Curl",  // Spider-hauiskääntö → Spider Curl
  ex_reverse_curl: "Standing_Dumbbell_Reverse_Curl",  // Käänteinen hauiskääntö → Standing Dumbbell Reverse Curl
  ex_machine_curl: "Machine_Bicep_Curl",  // käsin valittu → Machine Bicep Curl
  ex_wrist_curl: "Cable_Wrist_Curl",  // Ranteenkoukistus → Cable Wrist Curl   // vaihtoehtoja: Palms-Down Dumbbell Wrist Curl Over A Bench, Palms-Down Wrist Curl Over A Bench
  ex_ab_crunch_machine: "Ab_Crunch_Machine",  // Vatsarutistus laitteessa → Ab Crunch Machine
  ex_hanging_knee_raise: "Knee_Hip_Raise_On_Parallel_Bars",  // käsin valittu → Knee/Hip Raise On Parallel Bars
  ex_decline_sit_up: "Decline_Crunch",  // Vatsarutistus alavinopenkillä → Decline Crunch
  ex_bicycle_crunch: "Air_Bike",  // Polkupyörävatsarutistus → Air Bike   // vaihtoehtoja: Cross-Body Crunch
  ex_mountain_climber: "Mountain_Climbers",  // Vuorikiipeilijä → Mountain Climbers
  ex_lying_leg_raise: "Flat_Bench_Lying_Leg_Raise",  // Jalkojen nosto lattialla → Flat Bench Lying Leg Raise
  ex_cable_woodchop: "Standing_Cable_Wood_Chop",  // Halonhakkuu taljassa → Standing Cable Wood Chop
  // TODO ei osumaa: ex_bird_dog  (Lintukoira)
  ex_power_clean: "Clean",  // Power clean → Clean   // vaihtoehtoja: Alternating Hang Clean, Double Kettlebell Alternating Hang Clean
  ex_push_press: "Push_Press",  // Push press → Push Press   // vaihtoehtoja: Double Kettlebell Push Press, One-Arm Kettlebell Push Press
  ex_box_jump: "Front_Box_Jump",  // Loikka boksille → Front Box Jump   // vaihtoehtoja: Box Jump (Multiple Response), Dumbbell Seated Box Jump
  // TODO ei osumaa: ex_burpee  (Burpee)
  ex_med_ball_slam: "One-Arm_Medicine_Ball_Slam",  // Kuntopallon isku → One-Arm Medicine Ball Slam
  ex_battle_ropes: "Battling_Ropes",  // Battle ropes → Battling Ropes
  ex_high_row: "Leverage_High_Row",  // High row → Leverage High Row
  // TODO ei osumaa: ex_oblique_raise_bench  (Kylkinosto selkäpenkissä)
};

// Ilman kuvaa jäävät (ei vastinetta lähdedatassa):
//   ex_belt_squat             Vyökyykky
//   ex_single_leg_press       Yhden jalan jalkaprässi   (vain kahden jalan prässi → harhaanjohtava)
//   ex_machine_lateral_raise  Vipunosto laitteessa      (vain käsipaino-/taljaversiot)
//   ex_reverse_pec_deck       Käänteinen pec deck       (vain talja- ja käsipainoversiot)
//   ex_cable_front_raise      Vipunosto eteen taljassa  (vain käsipainoversio)
//   ex_bird_dog               Lintukoira
//   ex_burpee                 Burpee
//   ex_oblique_raise_bench    Kylkinosto selkäpenkissä  (vain lattia-/vinopenkkiversiot)
