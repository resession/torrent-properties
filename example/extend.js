const Webtorrent = require('webtorrent')
const Properties = require('../index')
const sodium = require('sodium-universal')

function verify (signature, message, publicKey) {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey)
  }

class WebTorrentProperties extends Webtorrent {
    constructor(options){
        super(options || {dht: {verify}})
        this.properties = new Properties(this.dht)
    }
    downloadProp(address, manage, opts, callback){
        this.properties.resolve(address, manage, (resError, propData) => {
            if(resError){
                console.log(resError)
                return this.emit(resError)
            } else {
                this.add(propData.infoHash, opts, torrent => {
                    torrent.address = propData.address
                    torrent.sequence = propData.sequence
                    torrent.own = propData.own
                    return callback(torrent, propData)
                })
            }
        })
    }
    uploadProp(keypair, manage, data, opts, callback){
        this.seed(data, opts, torrent => {
            this.properties.publish(keypair, torrent.infoHash, manage, (resError, propData) => {
                if(resError){
                    console.log(resError)
                    return this.emit(resError)
                } else {
                    torrent.address = propData.address
                    torrent.sequence = propData.sequence
                    torrent.own = propData.own
                    return callback(torrent, propData)
                }
            })
        })
    }
}

module.exports = WebTorrentProperties