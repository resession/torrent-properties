const sodium = require('sodium-universal')
const sha1 = require('simple-sha1')

const BTPK_PREFIX = 'urn:btpk:'
const BITH_PREFIX = 'urn:btih:'

function verify (signature, message, address) {
  return sodium.crypto_sign_verify_detached(signature, message, address)
}

function sign (message, address, secret) {
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, message, secret)
  return signature
}

class Properties {
  constructor (dht) {
      this.dht = dht
      this.properties = []

      this.keepItUpdated()
  }

  async keepItUpdated(){
    for(let i = 0;this.properties.length;i++){
      let res = await new Promise((resolve, reject) => {
        this.repub(this.properties[i].address, (error, data) => {
          if(error){
            reject(null)
          } else {
            resolve(data)
          }
        })
      })
      if(res){
        this.properties[i].infoHash = res.v.ih ? req.v.ih : this.properties[i].infoHash
        this.properties[i].sequence = req.seq ? req.seq : this.properties[i].sequence
      }
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    setTimeout(this.keepItUpdated, 3600000)
  }

  // might need it later, if we have a 100 torrents, then it would mean 100 lookups one after another, would be good to delay it for a few seconds
  // ddelayNow(milliSec){
  //   return new Promise(resolve => setTimeout(resolve, milliSec))
  // }

  removeProperty(address, callback){
    if(!callback){
      callback = noop
    }

    let lookAtProperty = this.getProperty(address, false)

    if(lookAtProperty !== null){
      this.properties = this.properties.filter(data => {return data.address !== address})
      // this.properties.splice(lookAtProperty, 1)
      return callback(null, 'address has been removed')
    } else {
      return callback(new Error('address is not managed'))
    }

  }

  getProperty(address, data){
    let iter = null
    for(let i = 0;i < this.properties.length;i++){
      if(this.properties[i].address === address){
        iter = data ? this.properties[i] : i
        break
        // return this.properties[i]
      }
    }
    return iter
  }

  updateProperty(address, callback){
    if(!callback){
      callback = noop
    }

    let lookAtProperty = this.getProperty(address, true)

    if(lookAtProperty){
      this.resolve(address, false, (error, data) => {
        if(error){
          return callback(error)
        } else {
          lookAtProperty.infoHash = data.infoHash
          lookAtProperty.sequence = data.sequence
          return callback(null, lookAtProperty)
        }
      })
    } else {
      return callback(new Error('address key is not managed'))
    }

  }

  resolve (address, manage, callback) {
    if(!callback){
      callback = () => noop
    }
    address = this.addressFromLink(address)
    if(!address){
      return callback(new Error('address can not be parsed'))
    }
    const addressKey = Buffer.from(address, 'hex')

    let propertyData = null
    if(manage){
      propertyData = this.getProperty(address, true)
      if(propertyData){
        return callback(new Error('address key is already managed'))
      }
    }

    sha1(addressKey, (targetID) => {
      this.dht.get(targetID, (err, res) => {
        if(err){
          return callback(err)
        } else if(res){
          const infoHash = res.v.ih
          const sequence = res.seq ? res.seq : 0

          if(manage){
            this.properties.push({ address, infoHash, sequence, own: false })
          }
          
          return callback(null, { address, infoHash, sequence, own: false })
        } else if(!res){
          return callback(new Error('Could not resolve address'))
        }
      })
    })
  }

  publish (infoData, manage, callback) {

    if (!callback) {
      callback = () => noop
    }
    if(!infoData || !infoData.infoHash){
      return callback(new Error('must have infoHash'))
    } else if(!infoData.address || !infoData.secret){
      infoData = {...infoData, ...this.createKeypair(false)}
    }

    // const keypair = !address || !secret ? this.createKeypair(false) : {address, secret}

    let checkinfoHash = null
    if(manage){
      checkinfoHash = this.getProperty(infoData.address, data)
      if(checkinfoHash.infoHash === infoData.infoHash){
        return callback(new Error('address key and infoHash is already managed'))
      }
    }

    const buffAddKey = Buffer.from(infoData.address, 'hex')
    const buffSecKey = Buffer.from(infoData.secret, 'hex')

    sha1(buffAddKey, (targetID) => {
      const dht = this.dht

      const opts = {
        k: buffAddKey,
        // seq: 0,
        v: {
          ih: Buffer.from(infoData.infoHash, 'hex')
        },
        sign: (buf) => {
          return sign(buf, buffAddKey, buffSecKey)
        }
      }

      dht.get(targetID, (err, res) => {
        if(err){
          return callback(err)
        } else {
          const sequence = (res && res.seq) ? res.seq + 1 : 1
          opts.seq = sequence
  
          dht.put(opts, (putErr, hash) => {
            if (putErr) return callback(putErr)
  
            const magnetURI = `magnet:?xs=${BTPK_PREFIX}${infoData.address}`
  
            if(manage){
              this.properties.push({address: infoData.address, infoHash: infoData.infoHash, sequence, own: true})
            }
  
            callback(null, {magnetURI, infoHash: infoData.infoHash, sequence, address: infoData.address, secret: infoData.secret, own: true})
          })
        }
      })
    })
  }

  repub (address, callback) {
    if (!callback) {
      callback = () => noop
    }

    const buffAddKey = Buffer.from(address, 'hex')

    sha1(buffAddKey, (targetID) => {
      const dht = this.dht

      dht.get(targetID, (err, res) => {
        if (err) {
          return callback(err)
        }

        dht.put(res, (err) => {
          if(err){
            return callback(err)
          } else {
            return callback(null, res)
          }
        })
      })
    })
  }

  createKeypair (seed) {
    const addressKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    if (seed) {
      sodium.crypto_sign_seed_keypair(addressKey, secretKey, seed)
    } else { sodium.crypto_sign_keypair(addressKey, secretKey) }

    return { address: addressKey.toString('hex'), secret: secretKey.toString('hex') }
  }

  addressFromLink(link){
    if(!link || typeof(link) !== 'string'){
      return ''
    } else if(link.startsWith('bt')){
      try {
        const parsed = new URL(link)
    
        if(!parsed.hostname){
          return ''
        } else {
          return parsed.hostname
        }

      } catch (error) {
        console.log(error)
        return ''
      }
    } else if(link.startsWith('magnet')){
      try {
        const parsed = new URL(link)

        const xs = parsed.searchParams.get('xs')
  
        const isMutableLink = xs && xs.startsWith(BTPK_PREFIX)
    
        if(!isMutableLink){
          return ''
        } else {
          return xs.slice(BTPK_PREFIX.length)
        }

      } catch (error) {
        console.log(error)
        return ''
      }
    } else {
      return link
    }
  }
}

module.exports = Properties

function noop () {}
