const DHT = require('bittorrent-dht')
const sodium = require('sodium-universal')
const sha1 = require('simple-sha1')
const fs = require('fs')

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
      this.dht = dht || new DHT()
      this.check = []

      if(fs.existsSync('./data')){
        this.check = JSON.parse(fs.readFileSync('./data'))
      }
      this.keepItUpdated()
  }

  /*
  when keepItUpdated() runs, it can save only the address, infoHash, and seq and save to file without getData and putData using array.map(),
  then use startUp() to get back the getData and putData from the dht because saving all that data will make the package a lot bigger
  */
  // async startUp(){
  //   if(fs.existsSync('./data')){
  //     this.check = JSON.parse(fs.readFileSync('./data'))
  //   }
  //   for(let i = 0;i < this.check.length;i++){
  //     let res = await new Promise((resolve, reject) => {
  //       this.current(this.check[i].address, (error, data) => {
  //         if(error){
  //           reject(null)
  //         } else {
  //           resolve(data)
  //         }
  //       })
  //     })
  //     if(res){
  //       this.check[i].infoHash = res.getData.v.ih ? res.v.ih : this.check[i].infoHash
  //       this.check[i].seq = res.getData.seq ? res.seq : this.check[i].seq
  //       this.check[i].getData = res.getData
  //       this.check[i].putData = res.putData
  //     }
  //   }
  // }

  /*
  when keepItUpdated() runs, it can save only the address, infoHash, and seq and save to file without getData and putData using array.map(),
  then use startUp() to get back the getData and putData from the dht because saving all that data will make the package a lot bigger
  */

  async keepItUpdated(){
    for(let i = 0;this.check.length;i++){
      let res = await new Promise((resolve, reject) => {
        this.current(this.check[i].address, (error, data) => {
          if(error){
            reject(null)
          } else {
            resolve(data)
          }
        })
      })
      if(res){
        this.check[i].infoHash = res.getData.v && res.getData.v.ih ? res.getData.v.ih : this.check[i].infoHash
        this.check[i].seq = res.getData.seq || res.getData.seq === 0 ? res.getData.seq : this.check[i].seq
        this.check[i].getData = res.getData
        this.check[i].putData = res.putData
      } else if(this.check[i].isActive){
        let shareCopy = await new Promise((resolve, reject) => {
          this.dht.put(this.check[i].getData, (error, hash, number) => {
            if(error){
              reject(null)
            } else {
              resolve({hash, number})
            }
          })
        })
        if(shareCopy){
          this.check[i].putData = shareCopy
        } else {
          this.check[i].isActive = false
        }
      }
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    fs.writeFileSync('./data', JSON.stringify(this.check.map(main => {return {address: main.address, infoHash: main.infoHash, seq: main.seq, isActive: main.isActive}})))
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
      this.check = this.check.filter(data => {return data.address !== address})
      // this.check.splice(lookAtProperty, 1)
      return callback(null, 'address has been removed')
    } else {
      return callback(new Error('address is not managed'))
    }

  }

  getProperty(address, data){
    let iter = null
    for(let i = 0;i < this.check.length;i++){
      if(this.check[i].address === address){
        iter = data ? this.check[i] : i
        break
        // return this.check[i]
      }
    }
    return iter
  }

  // updateProperty(address, callback){
  //   if(!callback){
  //     callback = noop
  //   }

  //   let lookAtProperty = this.getProperty(address, true)

  //   if(lookAtProperty){
  //     this.resolve(address, false, (error, data) => {
  //       if(error){
  //         return callback(error)
  //       } else {
  //         lookAtProperty.infoHash = data.infoHash
  //         lookAtProperty.seq = data.seq
  //         return callback(null, lookAtProperty)
  //       }
  //     })
  //   } else {
  //     return callback(new Error('address key is not managed'))
  //   }

  // }

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
      // if(propertyData){
      //   return callback(new Error('address key is already managed'))
      // }
    }

    sha1(addressKey, (targetID) => {
      this.dht.get(targetID, (err, res) => {
        if(err){
          return callback(err)
        } else if(res){
          const infoHash = res.v.ih
          const seq = res.seq ? res.seq : 0

          if(manage){
            if(propertyData){
              propertyData.infoHash = infoHash
              propertyData.seq = seq
            } else {
              this.check.push({ address, infoHash, seq, own: false, isActive: true, getData: res })
            }
          }
          
          return callback(null, { address, infoHash, seq, own: false })
        } else if(!res){
          if(manage && propertyData){
            return callback(null, propertyData)
          } else {
            return callback(new Error('Could not resolve address'))
          }
        }
      })
    })
  }

  publish (keypair, infoHash, manage, callback) {

    if (!callback) {
      callback = () => noop
    }
    if(!infoHash){
      return callback(new Error('must have infoHash'))
    } else if((!keypair) || (!keypair.address || !keypair.secret)){
      keypair = this.createKeypair(false)
    }

    // const keypair = !address || !secret ? this.createKeypair(false) : {address, secret}

    let propertyData = null
    if(manage){
      propertyData = this.getProperty(keypair.address, true)
      if(propertyData && propertyData.infoHash === infoHash){
        return callback(new Error('address key is already attached to this infoHash'))
      }
    }

    const buffAddKey = Buffer.from(keypair.address, 'hex')
    const buffSecKey = Buffer.from(keypair.secret, 'hex')
    const seq =  propertyData ? propertyData.seq + 1 : 0
    const getData = {k: buffAddKey, v: {ih: Buffer.from(infoHash, 'hex')}, seq, sign: (buf) => {return sign(buf, buffAddKey, buffSecKey)}}

    this.dht.put(getData, (putErr, hash, number) => {
      if(putErr){
        return callback(putErr)
      }

      const magnetURI = `magnet:?xs=${BTPK_PREFIX}${keypair.address}`

      if(manage){
        if(propertyData){
          propertyData.infoHash = infoHash
          propertyData.seq = seq
        } else {
          this.check.push({address: keypair.address, infoHash, seq, own: true, isActive: true, putData: {hash, number}, getData})
        }
      }

      callback(null, {magnetURI, infoHash, seq, address: keypair.address, secret: keypair.secret, own: true, hash})
    })
  }

  current(address, callback){
    if (!callback) {
      callback = () => noop
    }

    const buffAddKey = Buffer.from(address, 'hex')

    sha1(buffAddKey, (targetID) => {
      const dht = this.dht

      dht.get(targetID, (getErr, getData) => {
        if (getErr) {
          return callback(getErr)
        }

        dht.put(getData, (putErr, hash, number) => {
          if(putErr){
            return callback(putErr)
          } else {
            return callback(null, {getData, putData: {hash, number}})
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
