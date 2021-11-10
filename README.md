# Property | BEP 46 | Mutable | Test
## WIP

this is a package that focuses only on BEP 46. I want webtorrent to have BEP 46 capability but it seems like things has to be changed up under the hood for that which can take time. my thought is that maybe it can be possible to have a total separate package that manages the BEP 46 stuff. this way webtorrent can stay as it is and still gain BEP 46 capability. another good thing is other projects would be able to use this package as well.

https://github.com/RangerMauve/mutable-webtorrent <--- this was made by @rangermauve, it was a great intro and start for me. what i did is take things from this package, changed a few things and added some things as well.

for this package to work, you would just need to pass in an instance of webtorrent dht/bittorent-dht.

reference/guide/inspiration
https://github.com/lmatteis/dmt/
https://github.com/webtorrent/webtorrent
https://github.com/RangerMauve/mutable-webtorrent